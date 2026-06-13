import { Injectable } from '@nestjs/common';

import { Prisma, Source, SourceType } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Acesso às fontes de conteúdo (feeds RSS, repositórios, etc.).
 *
 * Começa simples — leituras básicas e criação — mas já centraliza o acesso
 * ao Prisma para evoluir (filtros, paginação, atualização de status) sem
 * espalhar queries pela aplicação.
 */
@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Source[]> {
    return this.prisma.source.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findEnabled(): Promise<Source[]> {
    return this.prisma.source.findMany({ where: { enabled: true } });
  }

  findEnabledByType(type: SourceType): Promise<Source[]> {
    return this.prisma.source.findMany({ where: { enabled: true, type } });
  }

  findById(id: string): Promise<Source | null> {
    return this.prisma.source.findUnique({ where: { id } });
  }

  create(data: Prisma.SourceCreateInput): Promise<Source> {
    return this.prisma.source.create({ data });
  }
}
