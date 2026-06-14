import { Injectable } from '@nestjs/common';

import {
  Content,
  ContentStatus,
  EnrichmentStatus,
  Prisma,
  Source,
} from '@prisma/client';

import { endOfUtcDay, startOfUtcDay } from '../../common/utils/utc-day.util';
import { PrismaService } from '../../database/prisma.service';

type ContentFilters = {
  category?: string;
  sourceId?: string;
  status?: ContentStatus;
};

/** Campos pt-BR já gerados pela IA, reaproveitados para exibição (ex.: radar). */
export type ContentTranslation = {
  translatedTitle: string | null;
  shortSummary: string | null;
  summary30s: string | null;
};

type PaginatedContents = {
  data: Content[];
  total: number;
};

const contentOrderBy: Prisma.ContentOrderByWithRelationInput[] = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { collectedAt: 'desc' },
];

/**
 * Acesso aos conteúdos coletados a partir das fontes.
 *
 * Mantém-se enxuto nesta fase, mas concentra o acesso ao Prisma para
 * suportar a evolução (deduplicação por URL, ordenação por score, filtros
 * por status/categoria) conforme o radar for implementado.
 */
@Injectable()
export class ContentsService {
  private now: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  setNowProvider(now: () => Date): void {
    this.now = now;
  }

  findAll(): Promise<Content[]> {
    return this.prisma.content.findMany({ orderBy: { collectedAt: 'desc' } });
  }

  findById(id: string): Promise<(Content & { source: Source }) | null> {
    return this.prisma.content.findUnique({
      where: { id },
      include: { source: true },
    });
  }

  findBySource(sourceId: string): Promise<Content[]> {
    return this.prisma.content.findMany({ where: { sourceId } });
  }

  async findPaginated(
    filters: ContentFilters,
    page: number,
    limit: number,
  ): Promise<PaginatedContents> {
    const where: Prisma.ContentWhereInput = {};

    if (filters.category !== undefined) {
      where.category = filters.category;
    }

    if (filters.sourceId !== undefined) {
      where.sourceId = filters.sourceId;
    }

    if (filters.status !== undefined) {
      where.status = filters.status;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.content.count({ where }),
      this.prisma.content.findMany({
        where,
        orderBy: contentOrderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, total };
  }

  async findToday(page: number, limit: number): Promise<PaginatedContents> {
    const now = this.now();
    const start = startOfUtcDay(now);
    const end = endOfUtcDay(now);
    const where: Prisma.ContentWhereInput = {
      OR: [
        { publishedAt: { gte: start, lte: end } },
        { collectedAt: { gte: start, lte: end } },
      ],
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.content.count({ where }),
      this.prisma.content.findMany({
        where,
        orderBy: contentOrderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, total };
  }

  findEligibleForDay(
    day: Date,
    maxItems: number,
  ): Promise<(Content & { source: Source })[]> {
    const start = startOfUtcDay(day);
    const end = endOfUtcDay(day);
    const where: Prisma.ContentWhereInput = {
      status: { in: [ContentStatus.NEW, ContentStatus.VISIBLE] },
      OR: [
        { publishedAt: { gte: start, lte: end } },
        { collectedAt: { gte: start, lte: end } },
      ],
    };

    return this.prisma.content.findMany({
      where,
      include: { source: true },
      orderBy: contentOrderBy,
      take: maxItems,
    });
  }

  async findMostRecentEligibleDay(notAfter: Date): Promise<Date | null> {
    const end = endOfUtcDay(notAfter);
    const status = { in: [ContentStatus.NEW, ContentStatus.VISIBLE] };

    const [latestPublished, latestCollected] = await Promise.all([
      this.prisma.content.findFirst({
        where: { status, publishedAt: { lte: end } },
        orderBy: { publishedAt: 'desc' },
        select: { publishedAt: true },
      }),
      this.prisma.content.findFirst({
        where: { status, collectedAt: { lte: end } },
        orderBy: { collectedAt: 'desc' },
        select: { collectedAt: true },
      }),
    ]);

    const candidates = [
      latestPublished?.publishedAt,
      latestCollected?.collectedAt,
    ].filter((value): value is Date => value != null);

    if (!candidates.length) return null;

    const mostRecent = candidates.reduce((a, b) => (a > b ? a : b));

    return startOfUtcDay(mostRecent);
  }

  /**
   * Traduções pt-BR já prontas (`COMPLETED`) para os conteúdos informados.
   *
   * Reaproveita o enrichment gerado sob demanda — sem disparar IA — para que o
   * radar exiba título/resumo em pt-BR quando o conteúdo já foi aberto. Conteúdos
   * sem tradução pronta simplesmente não aparecem no mapa (o chamador cai no
   * texto original do feed).
   */
  async findReadyTranslations(
    contentIds: string[],
  ): Promise<Map<string, ContentTranslation>> {
    if (contentIds.length === 0) return new Map();

    const rows = await this.prisma.contentEnrichment.findMany({
      where: {
        contentId: { in: contentIds },
        language: 'pt-BR',
        status: EnrichmentStatus.COMPLETED,
      },
      select: {
        contentId: true,
        translatedTitle: true,
        shortSummary: true,
        summary30s: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.contentId,
        {
          translatedTitle: row.translatedTitle,
          shortSummary: row.shortSummary,
          summary30s: row.summary30s,
        },
      ]),
    );
  }

  create(data: Prisma.ContentCreateInput): Promise<Content> {
    return this.prisma.content.create({ data });
  }

  /**
   * Cria um conteúdo de forma segura para duplicidade.
   *
   * Como `Content.url` é único, uma colisão dispara o erro P2002 do Prisma —
   * tratamos como duplicado (`'duplicate'`) em vez de propagar, permitindo que
   * a ingestão continue. Qualquer outro erro é repropagado.
   */
  async createIfNew(
    data: Prisma.ContentUncheckedCreateInput,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.content.create({ data });
      return 'created';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'duplicate';
      }
      throw error;
    }
  }
}
