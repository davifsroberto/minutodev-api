import { Injectable } from '@nestjs/common';

import { Content, ContentStatus, Prisma, Source } from '@prisma/client';

import { endOfUtcDay, startOfUtcDay } from '../../common/utils/utc-day.util';
import { PrismaService } from '../../database/prisma.service';

type ContentFilters = {
  category?: string;
  sourceId?: string;
  status?: ContentStatus;
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
