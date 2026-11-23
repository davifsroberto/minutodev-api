import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  Content,
  ContentEnrichment,
  EnrichmentStatus,
  Prisma,
  Source,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import {
  AiService,
  SupportedLanguage,
  TransientAiError,
} from '../ai/ai.service';
import { ContentsService } from '../contents/contents.service';
import { OpenGraphImageService } from '../images/open-graph.service';

export const DEFAULT_ENRICHMENT_LANGUAGE = 'pt-BR';

/** Mensagem amigável persistida em `errorMessage` quando a IA falha. */
const GENERATION_FAILURE_MESSAGE =
  'Não foi possível gerar a versão resumida com IA no momento. Tente novamente mais tarde.';

/**
 * Cooldown padrão para falha transitória SEM janela informada (5xx/timeout/rede):
 * segura o próximo auto-retry por um tempo curto em vez de martelar o provedor a
 * cada abertura.
 */
const TRANSIENT_DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Teto do cooldown. O 429 de cota pode pedir uma janela longa (até o reset
 * diário); limitamos para não travar o conteúdo por horas — se ainda estiver
 * esgotado quando a janela vencer, a próxima abertura só reaplica o cooldown.
 */
const TRANSIENT_MAX_COOLDOWN_MS = 3_600_000;

type ContentWithSource = Content & { source: Source };

type GenerationClaim = { enrichment: ContentEnrichment; owned: boolean };

/**
 * Enriquecimento persistido + metadados do conteúdo (imagem, fonte, data) que o
 * hero da página precisa. Composto em tempo de leitura a partir do `Content`,
 * mantendo o `Content` como fonte única da imagem (sem denormalizar).
 */
export type EnrichmentView = ContentEnrichment & {
  imageUrl: string | null;
  sourceName: string;
  publishedAt: Date | null;
};

/**
 * Enriquecimento (tradução/resumo/curadoria) de um Content, gerado sob demanda.
 *
 * Ao abrir um conteúdo, geramos a versão pt-BR via `AiService` apenas se ainda
 * não existir um enriquecimento COMPLETED — a segunda abertura serve do banco,
 * sem novo custo de IA. Toda a orquestração de IA passa pela fachada
 * `AiService`; este serviço nunca conhece um provedor concreto. Não há cron,
 * fila nem batch: a geração só ocorre nesta chamada, sob demanda.
 */
@Injectable()
export class EnrichmentsService {
  private readonly logger = new Logger(EnrichmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentsService: ContentsService,
    private readonly aiService: AiService,
    private readonly openGraph: OpenGraphImageService,
  ) {}

  async getOrCreateForContent(
    contentId: string,
    language: string = DEFAULT_ENRICHMENT_LANGUAGE,
  ): Promise<EnrichmentView> {
    const content = await this.contentsService.findById(contentId);

    if (content === null) {
      throw new NotFoundException('Content not found');
    }

    const record = await this.resolveRecord(content, language);

    return this.toView(record, content);
  }

  private async resolveRecord(
    content: ContentWithSource,
    language: string,
  ): Promise<ContentEnrichment> {
    const existing = await this.prisma.contentEnrichment.findUnique({
      where: { contentId_language: { contentId: content.id, language } },
    });

    if (existing !== null) {
      // Já há resultado pronto (COMPLETED) ou uma geração em andamento
      // (PROCESSING): devolve do banco sem disparar IA. PROCESSING é o que evita
      // uma segunda geração simultânea para o mesmo (contentId, language).
      if (
        existing.status === EnrichmentStatus.COMPLETED ||
        existing.status === EnrichmentStatus.PROCESSING
      ) {
        return existing;
      }

      // PENDING ainda dentro da janela de cooldown pós-429/5xx: serve o fallback
      // (título/resumo originais já persistidos) SEM chamar a IA de novo. Sem
      // isso, cada abertura durante um rate limit dispararia uma nova chamada que
      // leva 429 na hora — queimando cota e somando latência a toda view.
      if (this.isCoolingDown(existing)) {
        return existing;
      }
    }

    // Inexistente, PENDING fora do cooldown, ou FAILED: gera sob demanda.
    return this.generate(content, existing, language);
  }

  /** PENDING cujo `retryAfter` ainda não venceu: segurando o próximo auto-retry. */
  private isCoolingDown(enrichment: ContentEnrichment): boolean {
    return (
      enrichment.status === EnrichmentStatus.PENDING &&
      enrichment.retryAfter !== null &&
      enrichment.retryAfter.getTime() > Date.now()
    );
  }

  /** Converte a janela de retry do provedor em um instante absoluto (com teto). */
  private computeRetryAfter(error: TransientAiError): Date {
    const requested = error.retryAfterMs ?? TRANSIENT_DEFAULT_COOLDOWN_MS;
    const clamped = Math.min(Math.max(requested, 0), TRANSIENT_MAX_COOLDOWN_MS);

    return new Date(Date.now() + clamped);
  }

  /** Compõe o registro persistido com os metadados do conteúdo (hero). */
  private toView(
    enrichment: ContentEnrichment,
    content: ContentWithSource,
  ): EnrichmentView {
    return {
      ...enrichment,
      imageUrl: content.imageUrl,
      sourceName: content.source.name,
      publishedAt: content.publishedAt,
    };
  }

  private async generate(
    content: ContentWithSource,
    existing: ContentEnrichment | null,
    language: string,
  ): Promise<ContentEnrichment> {
    const claim = await this.claimForGeneration(content, existing, language);

    // Outra requisição venceu a corrida e já assumiu a geração (ou concluiu):
    // não disparamos uma segunda chamada de IA — só devolvemos o estado atual.
    if (!claim.owned) {
      return claim.enrichment;
    }

    return this.runGeneration(claim.enrichment, content, language);
  }

  /**
   * Reivindica o "slot" de geração de forma atômica para que apenas uma
   * requisição chame a IA para o mesmo (contentId, language). Retorna
   * `owned: false` quando outra requisição já assumiu (ou concluiu).
   */
  private async claimForGeneration(
    content: ContentWithSource,
    existing: ContentEnrichment | null,
    language: string,
  ): Promise<GenerationClaim> {
    if (existing === null) {
      return this.claimByCreate(content, language);
    }

    return this.claimByTransition(existing, content.id, language);
  }

  private async claimByCreate(
    content: ContentWithSource,
    language: string,
  ): Promise<GenerationClaim> {
    try {
      const created = await this.prisma.contentEnrichment.create({
        data: {
          ...this.fallbackFields(content, language),
          status: EnrichmentStatus.PROCESSING,
        },
      });

      return { enrichment: created, owned: true };
    } catch (error) {
      // Requisições simultâneas colidem no índice único (P2002): a outra criou
      // o registro primeiro. Relemos e cedemos a geração a ela.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const current = await this.requireExisting(content.id, language);

        return { enrichment: current, owned: false };
      }

      throw error;
    }
  }

  private async claimByTransition(
    existing: ContentEnrichment,
    contentId: string,
    language: string,
  ): Promise<GenerationClaim> {
    // Compare-and-swap: só assume a geração quem conseguir mover o registro de
    // PENDING/FAILED para PROCESSING. Em corrida, apenas uma requisição (a que
    // obtém count === 1) vence; as demais cedem.
    const { count } = await this.prisma.contentEnrichment.updateMany({
      where: {
        id: existing.id,
        status: { in: [EnrichmentStatus.PENDING, EnrichmentStatus.FAILED] },
      },
      data: {
        status: EnrichmentStatus.PROCESSING,
        errorMessage: null,
        retryAfter: null,
      },
    });

    if (count === 1) {
      return {
        enrichment: {
          ...existing,
          status: EnrichmentStatus.PROCESSING,
          errorMessage: null,
          retryAfter: null,
        },
        owned: true,
      };
    }

    const current = await this.requireExisting(contentId, language);

    return { enrichment: current, owned: false };
  }

  private async runGeneration(
    enrichment: ContentEnrichment,
    content: ContentWithSource,
    language: string,
  ): Promise<ContentEnrichment> {
    // Resolve a imagem (og:image) em paralelo com a IA: é independente do texto
    // e nunca lança, então aplicamos o que vier mesmo se a IA falhar.
    const imagePending = this.resolveMissingImage(content);

    try {
      const output = await this.aiService.enrichContent({
        title: content.title,
        summary: content.summary,
        // texto completo da fonte: principal matéria-prima do briefing
        sourceContent: content.rawSummary,
        url: content.url,
        sourceName: content.source.name,
        language: language as SupportedLanguage,
      });

      await imagePending;

      return await this.prisma.contentEnrichment.update({
        where: { id: enrichment.id },
        data: {
          translatedTitle: output.translatedTitle,
          summary30s: output.summary30s,
          shortSummary: output.shortSummary,
          whyItMatters: output.whyItMatters,
          keyInsight: output.keyInsight,
          keyPoints: output.keyPoints,
          example: output.example,
          whenToUse: output.whenToUse,
          audienceFor: output.audienceFor,
          audienceIgnore: output.audienceIgnore,
          briefContent: output.briefContent,
          provider: this.aiService.resolveProviderName(),
          model: this.aiService.resolveModelName(),
          status: EnrichmentStatus.COMPLETED,
          errorMessage: null,
          retryAfter: null,
        },
      });
    } catch (error) {
      // A imagem independe da IA: ainda vale aplicá-la mesmo na falha.
      await imagePending;

      // Falha transitória (rate limit/5xx/timeout) NÃO é definitiva: voltamos a
      // PENDING para que a próxima visualização tente de novo sozinha, em vez de
      // marcar um FAILED permanente (que exigiria ação manual). Gravamos também
      // `retryAfter` (a janela informada pelo provedor, com teto) para segurar o
      // auto-retry até lá — assim um rate limit não vira martelada a cada view.
      // Erros definitivos (bloqueio de segurança, resposta inválida, 4xx) viram
      // FAILED.
      const transient = error instanceof TransientAiError;

      // Log técnico (sem secrets — as mensagens dos provedores nunca incluem a
      // chave); o usuário vê o fallback (título/resumo originais).
      this.logger.error(
        `Falha ao enriquecer o conteúdo ${content.id}: ${this.describeError(error)}` +
          (transient ? ' (transitório — mantido retryável)' : ''),
      );

      return this.prisma.contentEnrichment.update({
        where: { id: enrichment.id },
        data:
          error instanceof TransientAiError
            ? {
                status: EnrichmentStatus.PENDING,
                errorMessage: null,
                retryAfter: this.computeRetryAfter(error),
              }
            : {
                status: EnrichmentStatus.FAILED,
                errorMessage: GENERATION_FAILURE_MESSAGE,
                retryAfter: null,
              },
      });
    }
  }

  /**
   * Preenche `Content.imageUrl` via og:image quando o RSS não trouxe imagem
   * (a ordem aprovada: imagem do RSS → og:image → imagem do feed → capa branded).
   * Best-effort: qualquer falha é engolida para não derrubar a geração. Muta o
   * `content` em memória para que a view composta já reflita a imagem nova na
   * primeira abertura.
   */
  private async resolveMissingImage(content: ContentWithSource): Promise<void> {
    if (content.imageUrl) return;

    try {
      const imageUrl = await this.openGraph.resolveImageUrl(content.url);
      if (!imageUrl) return;

      await this.prisma.content.update({
        where: { id: content.id },
        data: { imageUrl },
      });
      content.imageUrl = imageUrl;
    } catch (error) {
      this.logger.warn(
        `Falha ao aplicar og:image ao conteúdo ${content.id}: ${this.describeError(error)}`,
      );
    }
  }

  private fallbackFields(
    content: ContentWithSource,
    language: string,
  ): Prisma.ContentEnrichmentUncheckedCreateInput {
    return {
      contentId: content.id,
      language,
      translatedTitle: content.title,
      shortSummary: content.summary,
      whyItMatters: null,
      keyPoints: [],
      briefContent: content.summary,
      originalUrl: content.url,
    };
  }

  private async requireExisting(
    contentId: string,
    language: string,
  ): Promise<ContentEnrichment> {
    const current = await this.prisma.contentEnrichment.findUnique({
      where: { contentId_language: { contentId, language } },
    });

    if (current === null) {
      // Só chegamos aqui após uma colisão de unicidade ou transição perdida —
      // ambas pressupõem um registro já existente. Ausência é inesperada.
      throw new Error(
        `Enriquecimento esperado não encontrado para o conteúdo ${contentId}.`,
      );
    }

    return current;
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
