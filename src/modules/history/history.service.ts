import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, UserContentHistory } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from '../contents/contents.service';
import { HistoryItemDto } from './dto/history-item.dto';

type PaginatedHistory = {
  data: HistoryItemDto[];
  total: number;
};

/** Estado de leitura de um conteúdo para um usuário (Sprint 13C). */
export type ContentReadState = {
  opened: boolean;
  read: boolean;
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

  /**
   * Estado de leitura de vários conteúdos de uma vez (Sprint 13C) — o radar
   * personalizado usa isto para marcar `viewerState` e penalizar já lidos.
   * Uma única query servida pelo índice único (userId, contentId). Conteúdos
   * sem registro simplesmente não aparecem no Map (o chamador aplica o
   * default {opened:false, read:false}). `opened` é true sempre que há
   * registro; `read` quando `readAt` foi preenchido.
   */
  async findReadStatesForContents(
    userId: string,
    contentIds: string[],
  ): Promise<Map<string, ContentReadState>> {
    if (contentIds.length === 0) return new Map();

    const rows = await this.prisma.userContentHistory.findMany({
      where: { userId, contentId: { in: contentIds } },
      select: { contentId: true, openCount: true, readAt: true },
    });

    return new Map(
      rows.map((row) => [
        row.contentId,
        { opened: row.openCount > 0, read: row.readAt !== null },
      ]),
    );
  }

  private async ensureContentExists(contentId: string): Promise<void> {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true },
    });

    if (content === null) throw new NotFoundException('Content not found');
  }
}
