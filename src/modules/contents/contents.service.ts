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
}
