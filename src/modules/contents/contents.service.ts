import { Injectable } from '@nestjs/common';

import { Content, Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Acesso aos conteúdos coletados a partir das fontes.
 *
 * Mantém-se enxuto nesta fase, mas concentra o acesso ao Prisma para
 * suportar a evolução (deduplicação por URL, ordenação por score, filtros
 * por status/categoria) conforme o radar for implementado.
 */
@Injectable()
export class ContentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Content[]> {
    return this.prisma.content.findMany({ orderBy: { collectedAt: 'desc' } });
  }

  findById(id: string): Promise<Content | null> {
    return this.prisma.content.findUnique({ where: { id } });
  }

  findBySource(sourceId: string): Promise<Content[]> {
    return this.prisma.content.findMany({ where: { sourceId } });
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
