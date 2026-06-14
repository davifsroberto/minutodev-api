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

export const DEFAULT_ENRICHMENT_LANGUAGE = 'pt-BR';

/** Mensagem amigável persistida em `errorMessage` quando a IA falha. */
const GENERATION_FAILURE_MESSAGE =
  'Não foi possível gerar a versão resumida com IA no momento. Tente novamente mais tarde.';

type ContentWithSource = Content & { source: Source };

type GenerationClaim = { enrichment: ContentEnrichment; owned: boolean };

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
  ) {}

  async getOrCreateForContent(
    contentId: string,
    language: string = DEFAULT_ENRICHMENT_LANGUAGE,
  ): Promise<ContentEnrichment> {
    const content = await this.contentsService.findById(contentId);

    if (content === null) {
      throw new NotFoundException('Content not found');
    }

    const existing = await this.prisma.contentEnrichment.findUnique({
      where: { contentId_language: { contentId, language } },
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
    try {
      const output = await this.aiService.enrichContent({
        title: content.title,
        summary: content.summary,
        url: content.url,
        sourceName: content.source.name,
        language: language as SupportedLanguage,
      });

      return await this.prisma.contentEnrichment.update({
        where: { id: enrichment.id },
        data: {
          translatedTitle: output.translatedTitle,
          shortSummary: output.shortSummary,
          whyItMatters: output.whyItMatters,
          keyPoints: output.keyPoints,
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

      return this.prisma.contentEnrichment.update({
        where: { id: enrichment.id },
        data: {
          status: EnrichmentStatus.FAILED,
          errorMessage: GENERATION_FAILURE_MESSAGE,
        },
      });
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
