import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalog(): Promise<{ slug: string; label: string }[]> {
    return this.prisma.topic.findMany({
      where: { enabled: true },
      orderBy: { label: 'asc' },
      select: { slug: true, label: true },
    });
  }

  /** Slugs de interesse do usuário (array vazio = Radar Geral). */
  async getForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.userInterest.findMany({
      where: { userId },
      orderBy: { topic: { label: 'asc' } },
      select: { topic: { select: { slug: true } } },
    });

    return rows.map((row) => row.topic.slug);
  }

  /**
   * Substitui (replace total) o conjunto de interesses do usuário pelos slugs
   * informados. Slugs fora do catálogo habilitado são rejeitados com 400 antes
   * de tocar nas linhas — a FK para Topic garante a integridade no banco, mas o
   * erro explícito evita um 500 por violação de chave. Idempotente: re-enviar
   * os mesmos slugs resulta no mesmo estado.
   */
  async replaceForUser(userId: string, slugs: string[]): Promise<string[]> {
    const unique = [...new Set(slugs)];

    const topics = await this.prisma.topic.findMany({
      where: { slug: { in: unique }, enabled: true },
      select: { id: true, slug: true },
    });

    if (topics.length !== unique.length) {
      const known = new Set(topics.map((topic) => topic.slug));
      const unknown = unique.filter((slug) => !known.has(slug));
      throw new BadRequestException(
        `Temas de interesse desconhecidos: ${unknown.join(', ')}`,
      );
    }

    const operations = [
      this.prisma.userInterest.deleteMany({ where: { userId } }),
    ];
    if (topics.length > 0) {
      operations.push(
        this.prisma.userInterest.createMany({
          data: topics.map((topic) => ({ userId, topicId: topic.id })),
          // Tolera dois PUTs concorrentes do mesmo usuário: sem isso, ambas as
          // transações poderiam colidir no índice único (userId, topicId) e
          // estourar P2002. skipDuplicates mantém o replace idempotente.
          skipDuplicates: true,
        }),
      );
    }
    await this.prisma.$transaction(operations);

    return this.getForUser(userId);
  }
}
