import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  Content,
  ContentEnrichment,
  EnrichmentStatus,
  Prisma,
  Source,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { AiService, SupportedLanguage } from '../ai/ai.service';
import { ContentsService } from '../contents/contents.service';
import { OpenGraphImageService } from '../images/open-graph.service';

export const DEFAULT_ENRICHMENT_LANGUAGE = 'pt-BR';

/** Mensagem amigável persistida em `errorMessage` quando a IA falha. */
const GENERATION_FAILURE_MESSAGE =
  'Não foi possível gerar a versão resumida com IA no momento. Tente novamente mais tarde.';

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

    // Já há resultado pronto (COMPLETED) ou uma geração em andamento
    // (PROCESSING): devolve do banco sem disparar IA. PROCESSING é o que evita
    // uma segunda geração simultânea para o mesmo (contentId, language).
    if (
      existing !== null &&
      (existing.status === EnrichmentStatus.COMPLETED ||
        existing.status === EnrichmentStatus.PROCESSING)
    ) {
      return existing;
    }

    // Inexistente, PENDING (fallback do 5A) ou FAILED: gera sob demanda.
    return this.generate(content, existing, language);
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
      data: { status: EnrichmentStatus.PROCESSING, errorMessage: null },
    });

    if (count === 1) {
      return {
        enrichment: {
          ...existing,
          status: EnrichmentStatus.PROCESSING,
          errorMessage: null,
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
        },
      });
    } catch (error) {
      // Log técnico (sem secrets — as mensagens dos provedores nunca incluem a
      // chave); o usuário recebe uma mensagem amigável e genérica, e os campos
      // de fallback (título/resumo originais) permanecem visíveis.
      this.logger.error(
        `Falha ao enriquecer o conteúdo ${content.id}: ${this.describeError(error)}`,
      );

      // A imagem independe da IA: ainda vale aplicá-la mesmo no estado FAILED.
      await imagePending;

      return this.prisma.contentEnrichment.update({
        where: { id: enrichment.id },
        data: {
          status: EnrichmentStatus.FAILED,
          errorMessage: GENERATION_FAILURE_MESSAGE,
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
