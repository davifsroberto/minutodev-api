import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  Content,
  ContentStatus,
  ContentType,
  Source,
  SourceType,
} from '@prisma/client';

import { ContentsController } from './contents.controller';
import { ContentsService } from './contents.service';

type ContentsServiceMock = {
  findById: jest.Mock<Promise<(Content & { source: Source }) | null>, [string]>;
  findPaginated: jest.Mock<
    Promise<{ data: Content[]; total: number }>,
    [
      {
        category?: string;
        sourceId?: string;
        status?: ContentStatus;
      },
      number,
      number,
    ]
  >;
  findToday: jest.Mock<
    Promise<{ data: Content[]; total: number }>,
    [number, number]
  >;
};

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

const createServiceMock = (): ContentsServiceMock => ({
  findById: jest.fn<Promise<(Content & { source: Source }) | null>, [string]>(),
  findPaginated: jest.fn<
    Promise<{ data: Content[]; total: number }>,
    [
      {
        category?: string;
        sourceId?: string;
        status?: ContentStatus;
      },
      number,
      number,
    ]
  >(),
  findToday: jest.fn<
    Promise<{ data: Content[]; total: number }>,
    [number, number]
  >(),
});

describe('ContentsController', () => {
  let controller: ContentsController;
  let service: ContentsServiceMock;

  beforeEach(async () => {
    service = createServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentsController],
      providers: [
        {
          provide: ContentsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(ContentsController);
  });

  describe('findAll', () => {
    it('maps source to sourceId and forwards filters, page, and limit', async () => {
      const rows = [createContent()];
      service.findPaginated.mockResolvedValue({ data: rows, total: 1 });

      await controller.findAll({
        category: 'backend',
        limit: 10,
        page: 2,
        source: 'source-1',
        status: ContentStatus.VISIBLE,
      });

      expect(service.findPaginated).toHaveBeenCalledWith(
        {
          category: 'backend',
          sourceId: 'source-1',
          status: ContentStatus.VISIBLE,
        },
        2,
        10,
      );
    });

    it('wraps a populated service result into a paginated response', async () => {
      const rows = [createContent()];
      service.findPaginated.mockResolvedValue({ data: rows, total: 25 });

      await expect(controller.findAll({ limit: 10, page: 2 })).resolves.toEqual(
        {
          data: rows,
          meta: {
            limit: 10,
            page: 2,
            total: 25,
            totalPages: 3,
          },
        },
      );
    });

    it('wraps an empty service result without throwing', async () => {
      service.findPaginated.mockResolvedValue({ data: [], total: 0 });

      await expect(controller.findAll({ limit: 20, page: 1 })).resolves.toEqual(
        {
          data: [],
          meta: {
            limit: 20,
            page: 1,
            total: 0,
            totalPages: 0,
          },
        },
      );
    });
  });

  describe('findToday', () => {
    it('forwards page and limit without a filter object and wraps the result', async () => {
      const rows = [createContent()];
      service.findToday.mockResolvedValue({ data: rows, total: 25 });

      await expect(
        controller.findToday({ limit: 10, page: 2 }),
      ).resolves.toEqual({
        data: rows,
        meta: {
          limit: 10,
          page: 2,
          total: 25,
          totalPages: 3,
        },
      });
      expect(service.findToday).toHaveBeenCalledWith(2, 10);
    });
  });

  describe('findById', () => {
    it('returns the resolved entity with source', async () => {
      const row = { ...createContent(), source: createSource() };
      service.findById.mockResolvedValue(row);

      await expect(controller.findById(row.id)).resolves.toBe(row);
      expect(service.findById).toHaveBeenCalledWith(row.id);
    });

    it('throws NotFoundException when the service resolves null', async () => {
      service.findById.mockResolvedValue(null);

      await expect(controller.findById('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
