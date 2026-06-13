import { Test, TestingModule } from '@nestjs/testing';

import {
  Content,
  ContentStatus,
  ContentType,
  Prisma,
  Source,
  SourceType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from './contents.service';

type TransactionResult = [number, Content[]];

type ContentDelegateMock = {
  count: jest.Mock<unknown, [Prisma.ContentCountArgs]>;
  create: jest.Mock<Promise<Content>, [Prisma.ContentCreateArgs]>;
  findMany: jest.Mock<unknown, [Prisma.ContentFindManyArgs]>;
  findUnique: jest.Mock<
    Promise<(Content & { source: Source }) | null>,
    [Prisma.ContentFindUniqueArgs]
  >;
};

type PrismaServiceMock = {
  content: ContentDelegateMock;
  $transaction: jest.Mock<Promise<TransactionResult>, [unknown[]]>;
};

const orderBy = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { collectedAt: 'desc' },
];

const createContent = (overrides: Partial<Content> = {}): Content => ({
  author: null,
  category: 'backend',
  collectedAt: new Date('2026-06-13T12:00:00.000Z'),
  contentType: ContentType.ARTICLE,
  createdAt: new Date('2026-06-13T12:00:00.000Z'),
  id: 'content-1',
  publishedAt: new Date('2026-06-13T11:00:00.000Z'),
  rawData: null,
  rawSummary: null,
  rawTitle: null,
  score: 0,
  sourceId: 'source-1',
  status: ContentStatus.NEW,
  summary: null,
  tags: [],
  title: 'Content',
  updatedAt: new Date('2026-06-13T12:00:00.000Z'),
  url: 'https://example.test/content',
  ...overrides,
});

const createSource = (overrides: Partial<Source> = {}): Source => ({
  category: 'backend',
  createdAt: new Date('2026-06-13T12:00:00.000Z'),
  enabled: true,
  id: 'source-1',
  name: 'Source',
  type: SourceType.RSS,
  updatedAt: new Date('2026-06-13T12:00:00.000Z'),
  url: 'https://example.test/source',
  ...overrides,
});

const createPrismaMock = (): PrismaServiceMock => ({
  $transaction: jest.fn<Promise<TransactionResult>, [unknown[]]>(),
  content: {
    count: jest.fn<unknown, [Prisma.ContentCountArgs]>(),
    create: jest.fn<Promise<Content>, [Prisma.ContentCreateArgs]>(),
    findMany: jest.fn<unknown, [Prisma.ContentFindManyArgs]>(),
    findUnique: jest.fn<
      Promise<(Content & { source: Source }) | null>,
      [Prisma.ContentFindUniqueArgs]
    >(),
  },
});

describe('ContentsService', () => {
  let service: ContentsService;
  let prisma: PrismaServiceMock;
  let rows: Content[];

  beforeEach(async () => {
    prisma = createPrismaMock();
    rows = [createContent()];
    prisma.content.count.mockReturnValue('count-query');
    prisma.content.create.mockResolvedValue(rows[0]);
    prisma.content.findMany.mockReturnValue('find-many-query');
    prisma.$transaction.mockResolvedValue([5, rows]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(ContentsService);
  });

  const findManyArgs = (): Prisma.ContentFindManyArgs =>
    prisma.content.findMany.mock.calls[0][0];

  const countArgs = (): Prisma.ContentCountArgs =>
    prisma.content.count.mock.calls[0][0];

  const expectNoFilterKeys = (
    where: Prisma.ContentWhereInput,
    keys: Array<keyof Prisma.ContentWhereInput>,
  ) => {
    for (const key of keys) {
      expect(where).not.toHaveProperty(key);
    }
  };

  describe('findPaginated', () => {
    it('builds an empty where when no filters are supplied', async () => {
      await service.findPaginated({}, 1, 20);

      const where = countArgs().where;
      expect(where).toEqual({});
      expectNoFilterKeys(where ?? {}, ['category', 'sourceId', 'status']);
    });

    it('builds where with category only', async () => {
      await service.findPaginated({ category: 'backend' }, 1, 20);

      const where = countArgs().where;
      expect(where).toEqual({ category: 'backend' });
      expectNoFilterKeys(where ?? {}, ['sourceId', 'status']);
    });

    it('builds where with sourceId only', async () => {
      await service.findPaginated({ sourceId: 'source-1' }, 1, 20);

      const where = countArgs().where;
      expect(where).toEqual({ sourceId: 'source-1' });
      expectNoFilterKeys(where ?? {}, ['category', 'status']);
    });

    it('builds where with status only', async () => {
      await service.findPaginated({ status: ContentStatus.VISIBLE }, 1, 20);

      const where = countArgs().where;
      expect(where).toEqual({ status: ContentStatus.VISIBLE });
      expectNoFilterKeys(where ?? {}, ['category', 'sourceId']);
    });

    it('combines category, sourceId, and status filters', async () => {
      await service.findPaginated(
        {
          category: 'backend',
          sourceId: 'source-1',
          status: ContentStatus.VISIBLE,
        },
        1,
        20,
      );

      expect(countArgs().where).toEqual({
        category: 'backend',
        sourceId: 'source-1',
        status: ContentStatus.VISIBLE,
      });
    });

    it('passes newest-first ordering and page offset', async () => {
      await service.findPaginated({}, 3, 20);

      expect(findManyArgs()).toMatchObject({
        orderBy,
        skip: 40,
        take: 20,
      });
    });

    it('runs count and findMany in one transaction with the same where object', async () => {
      await service.findPaginated({ category: 'backend' }, 2, 10);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'count-query',
        'find-many-query',
      ]);
      expect(countArgs().where).toBe(findManyArgs().where);
    });

    it('maps the transaction tuple to data and total', async () => {
      await expect(service.findPaginated({}, 1, 20)).resolves.toEqual({
        data: rows,
        total: 5,
      });
    });
  });

  describe('findToday', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T14:30:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('builds the UTC-day OR where and newest-first ordering', async () => {
      await service.findToday(1, 20);

      const start = new Date('2026-06-13T00:00:00.000Z');
      const end = new Date('2026-06-13T23:59:59.999Z');

      expect(countArgs().where).toEqual({
        OR: [
          { publishedAt: { gte: start, lte: end } },
          { collectedAt: { gte: start, lte: end } },
        ],
      });
      expect(findManyArgs().orderBy).toEqual(orderBy);
    });

    it('runs count and findMany in one transaction with pagination', async () => {
      await service.findToday(3, 20);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'count-query',
        'find-many-query',
      ]);
      expect(countArgs().where).toBe(findManyArgs().where);
      expect(findManyArgs()).toMatchObject({
        skip: 40,
        take: 20,
      });
    });
  });

  describe('findEligibleForDay', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T14:30:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('finds eligible content for the supplied UTC day with source included', async () => {
      const day = new Date('2026-05-20T18:45:30.000Z');
      const start = new Date('2026-05-20T00:00:00.000Z');
      const end = new Date('2026-05-20T23:59:59.999Z');
      const source = createSource();
      const rowsWithSource = [{ ...rows[0], source }];
      prisma.content.findMany.mockResolvedValue(rowsWithSource);

      await expect(service.findEligibleForDay(day, 500)).resolves.toBe(
        rowsWithSource,
      );

      expect(prisma.content.findMany).toHaveBeenCalledTimes(1);
      expect(findManyArgs()).toEqual({
        where: {
          status: { in: [ContentStatus.NEW, ContentStatus.VISIBLE] },
          OR: [
            { publishedAt: { gte: start, lte: end } },
            { collectedAt: { gte: start, lte: end } },
          ],
        },
        include: { source: true },
        orderBy,
        take: 500,
      });
    });
  });

  describe('findById', () => {
    it('includes source and returns the resolved entity', async () => {
      const content = createContent();
      const source = createSource();
      const row = { ...content, source };
      prisma.content.findUnique.mockResolvedValue(row);

      await expect(service.findById(content.id)).resolves.toBe(row);
      expect(prisma.content.findUnique).toHaveBeenCalledWith({
        where: { id: content.id },
        include: { source: true },
      });
    });

    it('returns null when Prisma does not find a row', async () => {
      prisma.content.findUnique.mockResolvedValue(null);

      await expect(service.findById('missing-id')).resolves.toBeNull();
    });
  });

  describe('existing methods', () => {
    it('keeps findAll ordered by collectedAt descending', async () => {
      prisma.content.findMany.mockResolvedValue(rows);

      await expect(service.findAll()).resolves.toBe(rows);
      expect(prisma.content.findMany).toHaveBeenCalledWith({
        orderBy: { collectedAt: 'desc' },
      });
    });

    it('keeps findBySource filtered by sourceId', async () => {
      prisma.content.findMany.mockResolvedValue(rows);

      await expect(service.findBySource('source-1')).resolves.toBe(rows);
      expect(prisma.content.findMany).toHaveBeenCalledWith({
        where: { sourceId: 'source-1' },
      });
    });

    it('keeps create delegating to Prisma content.create', async () => {
      const data: Prisma.ContentCreateInput = {
        contentType: ContentType.ARTICLE,
        source: { connect: { id: 'source-1' } },
        tags: [],
        title: 'Content',
        url: 'https://example.test/content',
      };

      await expect(service.create(data)).resolves.toBe(rows[0]);
      expect(prisma.content.create).toHaveBeenCalledWith({ data });
    });

    it('keeps createIfNew returning created after a successful create', async () => {
      const data: Prisma.ContentUncheckedCreateInput = {
        contentType: ContentType.ARTICLE,
        sourceId: 'source-1',
        tags: [],
        title: 'Content',
        url: 'https://example.test/content',
      };

      await expect(service.createIfNew(data)).resolves.toBe('created');
      expect(prisma.content.create).toHaveBeenCalledWith({ data });
    });

    it('keeps createIfNew returning duplicate for Prisma P2002', async () => {
      const data: Prisma.ContentUncheckedCreateInput = {
        contentType: ContentType.ARTICLE,
        sourceId: 'source-1',
        tags: [],
        title: 'Content',
        url: 'https://example.test/content',
      };
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          clientVersion: '7.8.0',
          code: 'P2002',
        },
      );
      prisma.content.create.mockRejectedValue(error);

      await expect(service.createIfNew(data)).resolves.toBe('duplicate');
    });

    it('keeps createIfNew rethrowing non-duplicate errors', async () => {
      const data: Prisma.ContentUncheckedCreateInput = {
        contentType: ContentType.ARTICLE,
        sourceId: 'source-1',
        tags: [],
        title: 'Content',
        url: 'https://example.test/content',
      };
      const error = new Error('database unavailable');
      prisma.content.create.mockRejectedValue(error);

      await expect(service.createIfNew(data)).rejects.toBe(error);
    });
  });
});
