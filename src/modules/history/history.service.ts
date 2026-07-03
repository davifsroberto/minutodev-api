import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, UserContentHistory } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from '../contents/contents.service';
import { HistoryItemDto } from './dto/history-item.dto';

type PaginatedHistory = {
  data: HistoryItemDto[];
  total: number;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Histórico de leitura por usuário (V2). Não é analytics: registra apenas o
 * vínculo usuário↔conteúdo para a página de histórico e, futuramente, para o
 * radar personalizado (Sprint 12) reduzir repetição de já lidos.
 */
@Injectable()
export class HistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentsService: ContentsService,
  ) {}

  /**
   * Registra a abertura de um conteúdo: cria o registro na primeira vez;
   * nas seguintes atualiza `lastOpenedAt` e incrementa `openCount`. Dois
   * upserts concorrentes podem colidir no índice único (userId, contentId)
   * com P2002 — a retentativa cai no caminho de update e preserva a
   * idempotência da rota.
   */
  async registerOpen(
    userId: string,
    contentId: string,
  ): Promise<UserContentHistory> {
    await this.ensureContentExists(contentId);

    const upsert = () =>
      this.prisma.userContentHistory.upsert({
        where: { userId_contentId: { userId, contentId } },
        create: { userId, contentId },
        update: { lastOpenedAt: new Date(), openCount: { increment: 1 } },
      });

    try {
      return await upsert();
    } catch (error) {
      if (isUniqueViolation(error)) return upsert();
      throw error;
    }
  }

  /**
   * Marca o conteúdo como lido preenchendo `readAt` uma única vez — chamadas
   * repetidas preservam o primeiro `readAt` e nunca alteram `firstOpenedAt`/
   * `lastOpenedAt`. Sem abertura prévia, cria o registro já lido.
   */
  async markAsRead(
    userId: string,
    contentId: string,
  ): Promise<UserContentHistory> {
    await this.ensureContentExists(contentId);

    const key = { userId_contentId: { userId, contentId } };
    const existing = await this.prisma.userContentHistory.findUnique({
      where: key,
    });

    if (existing) {
      if (existing.readAt) return existing;

      return this.prisma.userContentHistory.update({
        where: key,
        data: { readAt: new Date() },
      });
    }

    try {
      return await this.prisma.userContentHistory.create({
        data: { userId, contentId, readAt: new Date() },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Corrida com um open concorrente: o registro passou a existir sem
      // readAt — preenche nele em vez de propagar o P2002.
      return this.prisma.userContentHistory.update({
        where: key,
        data: { readAt: new Date() },
      });
    }
  }

  /**
   * Histórico do usuário ordenado por último acesso, com os dados de exibição
   * do conteúdo. Reaproveita as traduções pt-BR prontas (mesma estratégia do
   * radar) para o título acompanhar o restante da interface.
   */
  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedHistory> {
    const [total, entries] = await this.prisma.$transaction([
      this.prisma.userContentHistory.count({ where: { userId } }),
      this.prisma.userContentHistory.findMany({
        where: { userId },
        orderBy: { lastOpenedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { content: { include: { source: true } } },
      }),
    ]);

    const translations = await this.contentsService.findReadyTranslations(
      entries.map((entry) => entry.contentId),
    );

    const data = entries.map((entry) =>
      HistoryItemDto.from(entry, translations.get(entry.contentId)),
    );

    return { data, total };
  }

  private async ensureContentExists(contentId: string): Promise<void> {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true },
    });

    if (content === null) throw new NotFoundException('Content not found');
  }
}
