import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  Content,
  ContentEnrichment,
  ContentStatus,
  ContentType,
  EnrichmentStatus,
  Prisma,
  Source,
  SourceType,
} from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from '../contents/contents.service';
import {
  DEFAULT_ENRICHMENT_LANGUAGE,
  EnrichmentsService,
} from './enrichments.service';

type ContentWithSource = Content & { source: Source };

type ContentEnrichmentDelegateMock = {
  findUnique: jest.Mock<
    Promise<ContentEnrichment | null>,
    [Prisma.ContentEnrichmentFindUniqueArgs]
  >;
  create: jest.Mock<
    Promise<ContentEnrichment>,
    [Prisma.ContentEnrichmentCreateArgs]
  >;
};

type PrismaServiceMock = {
  contentEnrichment: ContentEnrichmentDelegateMock;
};

type ContentsServiceMock = {
  findById: jest.Mock<Promise<ContentWithSource | null>, [string]>;
};

const createSource = (overrides: Partial<Source> = {}): Source => ({
  category: 'backend',
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  enabled: true,
  id: 'source-1',
  name: 'Source',
  type: SourceType.RSS,
  updatedAt: new Date('2026-06-14T12:00:00.000Z'),
  url: 'https://example.test/source',
  ...overrides,
});

const createContent = (
  overrides: Partial<Content> = {},
): ContentWithSource => ({
  author: null,
  category: 'backend',
  collectedAt: new Date('2026-06-14T12:00:00.000Z'),
  contentType: ContentType.ARTICLE,
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  id: 'content-1',
  publishedAt: new Date('2026-06-14T11:00:00.000Z'),
  rawData: null,
  rawSummary: null,
  rawTitle: null,
  score: 0,
  source: createSource(),
  sourceId: 'source-1',
  status: ContentStatus.NEW,
  summary: 'Resumo do conteúdo.',
  tags: [],
  title: 'Título original',
  updatedAt: new Date('2026-06-14T12:00:00.000Z'),
  url: 'https://example.test/content',
  ...overrides,
});

const createEnrichment = (
  overrides: Partial<ContentEnrichment> = {},
): ContentEnrichment => ({
  briefContent: 'Resumo do conteúdo.',
  contentId: 'content-1',
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  errorMessage: null,
  id: 'enrichment-1',
  keyPoints: [],
  language: DEFAULT_ENRICHMENT_LANGUAGE,
  model: null,
  originalUrl: 'https://example.test/content',
  provider: null,
  shortSummary: 'Resumo do conteúdo.',
  status: EnrichmentStatus.PENDING,
  translatedTitle: 'Título original',
  updatedAt: new Date('2026-06-14T12:00:00.000Z'),
  whyItMatters: null,
  ...overrides,
});

const createPrismaMock = (): PrismaServiceMock => ({
  contentEnrichment: {
    findUnique: jest.fn<
      Promise<ContentEnrichment | null>,
      [Prisma.ContentEnrichmentFindUniqueArgs]
    >(),
    create: jest.fn<
      Promise<ContentEnrichment>,
      [Prisma.ContentEnrichmentCreateArgs]
    >(),
  },
});

describe('EnrichmentsService', () => {
  let service: EnrichmentsService;
  let prisma: PrismaServiceMock;
  let contents: ContentsServiceMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    contents = {
      findById: jest.fn<Promise<ContentWithSource | null>, [string]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContentsService, useValue: contents },
      ],
    }).compile();

    service = module.get(EnrichmentsService);
  });

  describe('getOrCreateForContent', () => {
    it('throws NotFoundException when the content does not exist', async () => {
      contents.findById.mockResolvedValue(null);

      await expect(
        service.getOrCreateForContent('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(contents.findById).toHaveBeenCalledWith('missing-id');
      expect(prisma.contentEnrichment.findUnique).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.create).not.toHaveBeenCalled();
    });

    it('returns the existing pt-BR enrichment without creating a new one', async () => {
      const content = createContent();
      const existing = createEnrichment({ status: EnrichmentStatus.COMPLETED });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(existing);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        existing,
      );
      expect(prisma.contentEnrichment.findUnique).toHaveBeenCalledWith({
        where: {
          contentId_language: {
            contentId: content.id,
            language: DEFAULT_ENRICHMENT_LANGUAGE,
          },
        },
      });
      expect(prisma.contentEnrichment.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING fallback derived from the content when absent', async () => {
      const content = createContent({
        title: 'TypeScript 5.7',
        summary: 'Resumo curto.',
        url: 'https://example.test/ts-5-7',
      });
      const created = createEnrichment();
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(created);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        created,
      );
      expect(prisma.contentEnrichment.create).toHaveBeenCalledWith({
        data: {
          contentId: content.id,
          language: DEFAULT_ENRICHMENT_LANGUAGE,
          translatedTitle: 'TypeScript 5.7',
          shortSummary: 'Resumo curto.',
          whyItMatters: null,
          keyPoints: [],
          briefContent: 'Resumo curto.',
          originalUrl: 'https://example.test/ts-5-7',
          status: EnrichmentStatus.PENDING,
        },
      });
    });

    it('carries a null content summary into the fallback summary fields', async () => {
      const content = createContent({ summary: null });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(
        createEnrichment({ shortSummary: null, briefContent: null }),
      );

      await service.getOrCreateForContent(content.id);

      expect(
        prisma.contentEnrichment.create.mock.calls[0][0].data,
      ).toMatchObject({
        shortSummary: null,
        briefContent: null,
      });
    });

    it('re-reads the record created by a concurrent request on P2002', async () => {
      const content = createContent();
      const concurrent = createEnrichment({ id: 'concurrent-1' });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrent);
      prisma.contentEnrichment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          clientVersion: '7.8.0',
          code: 'P2002',
        }),
      );

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        concurrent,
      );
      expect(prisma.contentEnrichment.findUnique).toHaveBeenCalledTimes(2);
    });

    it('rethrows create errors that are not unique-constraint violations', async () => {
      const content = createContent();
      const error = new Error('database unavailable');
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockRejectedValue(error);

      await expect(service.getOrCreateForContent(content.id)).rejects.toBe(
        error,
      );
    });

    it('honors a custom language for both the lookup and the fallback', async () => {
      const content = createContent();
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(
        createEnrichment({ language: 'en' }),
      );

      await service.getOrCreateForContent(content.id, 'en');

      expect(prisma.contentEnrichment.findUnique).toHaveBeenCalledWith({
        where: {
          contentId_language: { contentId: content.id, language: 'en' },
        },
      });
      expect(
        prisma.contentEnrichment.create.mock.calls[0][0].data,
      ).toMatchObject({ language: 'en' });
    });
  });
});
