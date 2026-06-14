import { Injectable, NotFoundException } from '@nestjs/common';

import {
  Content,
  ContentEnrichment,
  EnrichmentStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from '../contents/contents.service';

export const DEFAULT_ENRICHMENT_LANGUAGE = 'pt-BR';

/**
 * Enriquecimento (tradução/resumo/curadoria) de um Content.
 *
 * Nesta fase não há IA: o acesso inicializa sob demanda um registro PENDING
 * com fallback derivado do próprio Content. O pipeline de IA futuro apenas
 * evoluirá esse registro (status, provider/model, campos traduzidos).
 */
@Injectable()
export class EnrichmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentsService: ContentsService,
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

    if (existing !== null) {
      return existing;
    }

    return this.createFallback(content, language);
  }

  private async createFallback(
    content: Content,
    language: string,
  ): Promise<ContentEnrichment> {
    try {
      return await this.prisma.contentEnrichment.create({
        data: {
          contentId: content.id,
          language,
          translatedTitle: content.title,
          shortSummary: content.summary,
          whyItMatters: null,
          keyPoints: [],
          briefContent: content.summary,
          originalUrl: content.url,
          status: EnrichmentStatus.PENDING,
        },
      });
    } catch (error) {
      // Requisições simultâneas para o mesmo (contentId, language) colidem no
      // índice único (P2002). Em vez de propagar, relemos o registro criado
      // pela outra requisição — o acesso continua idempotente.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const created = await this.prisma.contentEnrichment.findUnique({
          where: { contentId_language: { contentId: content.id, language } },
        });

        if (created !== null) {
          return created;
        }
      }

      throw error;
    }
  }
}
