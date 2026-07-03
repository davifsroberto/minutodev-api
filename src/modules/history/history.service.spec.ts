import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from '../contents/contents.service';
import { HistoryService } from './history.service';

type PrismaServiceMock = {
  content: { findUnique: jest.Mock };
  userContentHistory: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type ContentsServiceMock = {
  findReadyTranslations: jest.Mock;
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

const historyEntry = {
  id: 'h-1',
  userId: 'user-1',
  contentId: 'c-1',
  firstOpenedAt: new Date('2026-07-01T10:00:00.000Z'),
  lastOpenedAt: new Date('2026-07-02T12:00:00.000Z'),
  readAt: null as Date | null,
  openCount: 2,
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T12:00:00.000Z'),
};

describe('HistoryService', () => {
  let service: HistoryService;
  let prisma: PrismaServiceMock;
  let contents: ContentsServiceMock;

  beforeEach(async () => {
    prisma = {
      content: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1' }) },
      userContentHistory: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockReturnValue({ op: 'count' }),
        findMany: jest.fn().mockReturnValue({ op: 'findMany' }),
      },
      $transaction: jest.fn(),
    };
    contents = {
      findReadyTranslations: jest.fn().mockResolvedValue(new Map()),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContentsService, useValue: contents },
      ],
    }).compile();

    service = moduleRef.get(HistoryService);
  });

  describe('registerOpen', () => {
    it('rejeita conteúdo inexistente com NotFoundException sem tocar no histórico', async () => {
      prisma.content.findUnique.mockResolvedValue(null);

      await expect(
        service.registerOpen('user-1', 'c-missing'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.userContentHistory.upsert).not.toHaveBeenCalled();
    });

    it('faz upsert criando na primeira abertura e atualizando nas seguintes', async () => {
      prisma.userContentHistory.upsert.mockResolvedValue(historyEntry);

      await expect(service.registerOpen('user-1', 'c-1')).resolves.toBe(
        historyEntry,
      );

      expect(prisma.userContentHistory.upsert).toHaveBeenCalledWith({
        where: { userId_contentId: { userId: 'user-1', contentId: 'c-1' } },
        create: { userId: 'user-1', contentId: 'c-1' },
        update: {
          lastOpenedAt: expect.any(Date),
          openCount: { increment: 1 },
        },
      });
    });

    it('em corrida de upserts (P2002) tenta de novo e cai no caminho de update', async () => {
      prisma.userContentHistory.upsert
        .mockRejectedValueOnce(uniqueViolation())
        .mockResolvedValueOnce(historyEntry);

      await expect(service.registerOpen('user-1', 'c-1')).resolves.toBe(
        historyEntry,
      );

      expect(prisma.userContentHistory.upsert).toHaveBeenCalledTimes(2);
    });

    it('propaga erros que não sejam violação de unicidade', async () => {
      const failure = new Error('connection lost');
      prisma.userContentHistory.upsert.mockRejectedValue(failure);

      await expect(service.registerOpen('user-1', 'c-1')).rejects.toBe(failure);
      expect(prisma.userContentHistory.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAsRead', () => {
    it('rejeita conteúdo inexistente com NotFoundException', async () => {
      prisma.content.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('user-1', 'c-missing'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.userContentHistory.findUnique).not.toHaveBeenCalled();
    });

    it('sem abertura prévia cria o registro já lido', async () => {
      prisma.userContentHistory.findUnique.mockResolvedValue(null);
      const created = { ...historyEntry, readAt: new Date() };
      prisma.userContentHistory.create.mockResolvedValue(created);

      await expect(service.markAsRead('user-1', 'c-1')).resolves.toBe(created);

      expect(prisma.userContentHistory.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          contentId: 'c-1',
          readAt: expect.any(Date),
        },
      });
      expect(prisma.userContentHistory.update).not.toHaveBeenCalled();
    });

    it('preenche readAt em registro existente sem alterar as datas de abertura', async () => {
      prisma.userContentHistory.findUnique.mockResolvedValue(historyEntry);
      const read = { ...historyEntry, readAt: new Date() };
      prisma.userContentHistory.update.mockResolvedValue(read);

      await expect(service.markAsRead('user-1', 'c-1')).resolves.toBe(read);

      expect(prisma.userContentHistory.update).toHaveBeenCalledWith({
        where: { userId_contentId: { userId: 'user-1', contentId: 'c-1' } },
        data: { readAt: expect.any(Date) },
      });
    });

    it('é idempotente: preserva o primeiro readAt sem novo update', async () => {
      const alreadyRead = {
        ...historyEntry,
        readAt: new Date('2026-07-02T13:00:00.000Z'),
      };
      prisma.userContentHistory.findUnique.mockResolvedValue(alreadyRead);

      await expect(service.markAsRead('user-1', 'c-1')).resolves.toBe(
        alreadyRead,
      );

      expect(prisma.userContentHistory.update).not.toHaveBeenCalled();
      expect(prisma.userContentHistory.create).not.toHaveBeenCalled();
    });

    it('em corrida com um open concorrente (P2002 no create) preenche readAt via update', async () => {
      prisma.userContentHistory.findUnique.mockResolvedValue(null);
      prisma.userContentHistory.create.mockRejectedValue(uniqueViolation());
      const read = { ...historyEntry, readAt: new Date() };
      prisma.userContentHistory.update.mockResolvedValue(read);

      await expect(service.markAsRead('user-1', 'c-1')).resolves.toBe(read);

      expect(prisma.userContentHistory.update).toHaveBeenCalledWith({
        where: { userId_contentId: { userId: 'user-1', contentId: 'c-1' } },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('listForUser', () => {
    const entryWithContent = {
      ...historyEntry,
      content: {
        id: 'c-1',
        title: 'Original title',
        imageUrl: 'https://example.test/cover.png',
        publishedAt: new Date('2026-06-30T09:00:00.000Z'),
        source: { name: 'Fonte X' },
      },
    };

    it('lista o histórico paginado com dados de exibição do conteúdo', async () => {
      prisma.$transaction.mockResolvedValue([1, [entryWithContent]]);

      await expect(service.listForUser('user-1', 2, 10)).resolves.toEqual({
        total: 1,
        data: [
          {
            contentId: 'c-1',
            title: 'Original title',
            imageUrl: 'https://example.test/cover.png',
            sourceName: 'Fonte X',
            publishedAt: entryWithContent.content.publishedAt,
            lastOpenedAt: historyEntry.lastOpenedAt,
            readAt: null,
            status: 'OPENED',
          },
        ],
      });

      expect(prisma.userContentHistory.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { lastOpenedAt: 'desc' },
        skip: 10,
        take: 10,
        include: { content: { include: { source: true } } },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        { op: 'count' },
        { op: 'findMany' },
      ]);
    });

    it('usa o título traduzido quando a tradução pt-BR está pronta', async () => {
      prisma.$transaction.mockResolvedValue([1, [entryWithContent]]);
      contents.findReadyTranslations.mockResolvedValue(
        new Map([
          [
            'c-1',
            {
              translatedTitle: 'Título traduzido',
              shortSummary: null,
              summary30s: null,
            },
          ],
        ]),
      );

      const { data } = await service.listForUser('user-1', 1, 20);

      expect(data[0].title).toBe('Título traduzido');
      expect(contents.findReadyTranslations).toHaveBeenCalledWith(['c-1']);
    });

    it('marca como READ os itens com readAt preenchido', async () => {
      const readEntry = {
        ...entryWithContent,
        readAt: new Date('2026-07-02T13:00:00.000Z'),
      };
      prisma.$transaction.mockResolvedValue([1, [readEntry]]);

      const { data } = await service.listForUser('user-1', 1, 20);

      expect(data[0].status).toBe('READ');
      expect(data[0].readAt).toEqual(readEntry.readAt);
    });
  });
});
