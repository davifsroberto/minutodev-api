import { Logger, NotFoundException } from '@nestjs/common';
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
import {
  AiService,
  EnrichContentInput,
  EnrichContentOutput,
} from '../ai/ai.service';
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
  update: jest.Mock<
    Promise<ContentEnrichment>,
    [Prisma.ContentEnrichmentUpdateArgs]
  >;
  updateMany: jest.Mock<
    Promise<Prisma.BatchPayload>,
    [Prisma.ContentEnrichmentUpdateManyArgs]
  >;
};

type PrismaServiceMock = {
  contentEnrichment: ContentEnrichmentDelegateMock;
};

type ContentsServiceMock = {
  findById: jest.Mock<Promise<ContentWithSource | null>, [string]>;
};

type AiServiceMock = {
  enrichContent: jest.Mock<Promise<EnrichContentOutput>, [EnrichContentInput]>;
  resolveProviderName: jest.Mock<string, []>;
  resolveModelName: jest.Mock<string | null, []>;
};

const aiOutput: EnrichContentOutput = {
  translatedTitle: 'Título traduzido pela IA',
  shortSummary: 'Resumo curto gerado pela IA.',
  whyItMatters: 'Importa porque muda o fluxo de build.',
  keyPoints: ['Ponto 1', 'Ponto 2'],
  briefContent: 'Conteúdo curado e original em pt-BR.',
};

const createSource = (overrides: Partial<Source> = {}): Source => ({
  category: 'backend',
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  enabled: true,
  id: 'source-1',
  name: 'Compiler News',
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
    update: jest.fn<
      Promise<ContentEnrichment>,
      [Prisma.ContentEnrichmentUpdateArgs]
    >(),
    updateMany: jest.fn<
      Promise<Prisma.BatchPayload>,
      [Prisma.ContentEnrichmentUpdateManyArgs]
    >(),
  },
});

describe('EnrichmentsService', () => {
  let service: EnrichmentsService;
  let prisma: PrismaServiceMock;
  let contents: ContentsServiceMock;
  let ai: AiServiceMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    contents = {
      findById: jest.fn<Promise<ContentWithSource | null>, [string]>(),
    };
    ai = {
      enrichContent: jest
        .fn<Promise<EnrichContentOutput>, [EnrichContentInput]>()
        .mockResolvedValue(aiOutput),
      resolveProviderName: jest.fn<string, []>().mockReturnValue('gemini'),
      resolveModelName: jest
        .fn<string | null, []>()
        .mockReturnValue('gemini-2.5-flash'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ContentsService, useValue: contents },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(EnrichmentsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOrCreateForContent', () => {
    it('throws NotFoundException and never touches the DB nor the AI when the content does not exist', async () => {
      contents.findById.mockResolvedValue(null);

      await expect(
        service.getOrCreateForContent('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(contents.findById).toHaveBeenCalledWith('missing-id');
      expect(prisma.contentEnrichment.findUnique).not.toHaveBeenCalled();
      expect(ai.enrichContent).not.toHaveBeenCalled();
    });

    it('returns the existing COMPLETED enrichment from the DB without calling the AI', async () => {
      const content = createContent();
      const completed = createEnrichment({
        status: EnrichmentStatus.COMPLETED,
        provider: 'gemini',
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(completed);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        completed,
      );
      expect(ai.enrichContent).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.create).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.update).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.updateMany).not.toHaveBeenCalled();
    });

    it('returns an in-flight PROCESSING enrichment without triggering a second generation', async () => {
      const content = createContent();
      const processing = createEnrichment({
        status: EnrichmentStatus.PROCESSING,
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(processing);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        processing,
      );
      expect(ai.enrichContent).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.create).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.updateMany).not.toHaveBeenCalled();
    });

    it('generates on first access: creates PROCESSING, calls the AI and persists COMPLETED', async () => {
      const content = createContent({
        title: 'TypeScript 5.7',
        summary: 'Resumo curto.',
        url: 'https://example.test/ts-5-7',
      });
      const processing = createEnrichment({
        status: EnrichmentStatus.PROCESSING,
      });
      const completed = createEnrichment({
        status: EnrichmentStatus.COMPLETED,
        translatedTitle: aiOutput.translatedTitle,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(processing);
      prisma.contentEnrichment.update.mockResolvedValue(completed);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        completed,
      );

      // 1) cria já em PROCESSING com o fallback derivado do conteúdo
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
          status: EnrichmentStatus.PROCESSING,
        },
      });

      // 2) chama a IA pela fachada, com os dados do conteúdo
      expect(ai.enrichContent).toHaveBeenCalledWith({
        title: 'TypeScript 5.7',
        summary: 'Resumo curto.',
        url: 'https://example.test/ts-5-7',
        sourceName: 'Compiler News',
        language: DEFAULT_ENRICHMENT_LANGUAGE,
      });

      // 3) persiste o resultado como COMPLETED, com provider/model
      expect(prisma.contentEnrichment.update).toHaveBeenCalledWith({
        where: { id: processing.id },
        data: {
          translatedTitle: aiOutput.translatedTitle,
          shortSummary: aiOutput.shortSummary,
          whyItMatters: aiOutput.whyItMatters,
          keyPoints: aiOutput.keyPoints,
          briefContent: aiOutput.briefContent,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          status: EnrichmentStatus.COMPLETED,
          errorMessage: null,
        },
      });
    });

    it('regenerates from an existing PENDING fallback via a compare-and-swap to PROCESSING', async () => {
      const content = createContent();
      const pending = createEnrichment({ status: EnrichmentStatus.PENDING });
      const completed = createEnrichment({
        status: EnrichmentStatus.COMPLETED,
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(pending);
      prisma.contentEnrichment.updateMany.mockResolvedValue({ count: 1 });
      prisma.contentEnrichment.update.mockResolvedValue(completed);

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        completed,
      );

      expect(prisma.contentEnrichment.create).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.updateMany).toHaveBeenCalledWith({
        where: {
          id: pending.id,
          status: {
            in: [EnrichmentStatus.PENDING, EnrichmentStatus.FAILED],
          },
        },
        data: { status: EnrichmentStatus.PROCESSING, errorMessage: null },
      });
      expect(ai.enrichContent).toHaveBeenCalledTimes(1);
      expect(prisma.contentEnrichment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pending.id },
          data: expect.objectContaining({
            status: EnrichmentStatus.COMPLETED,
          }),
        }),
      );
    });

    it('retries from a previous FAILED enrichment', async () => {
      const content = createContent();
      const failed = createEnrichment({
        status: EnrichmentStatus.FAILED,
        errorMessage: 'erro anterior',
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(failed);
      prisma.contentEnrichment.updateMany.mockResolvedValue({ count: 1 });
      prisma.contentEnrichment.update.mockResolvedValue(
        createEnrichment({ status: EnrichmentStatus.COMPLETED }),
      );

      const result = await service.getOrCreateForContent(content.id);

      expect(result.status).toBe(EnrichmentStatus.COMPLETED);
      expect(ai.enrichContent).toHaveBeenCalledTimes(1);
    });

    it('persists FAILED with a friendly message (no secrets) and returns the record when the AI throws', async () => {
      const content = createContent();
      const processing = createEnrichment({
        status: EnrichmentStatus.PROCESSING,
      });
      const failed = createEnrichment({
        status: EnrichmentStatus.FAILED,
        errorMessage:
          'Não foi possível gerar a versão resumida com IA no momento. Tente novamente mais tarde.',
      });
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(processing);
      ai.enrichContent.mockRejectedValue(
        new Error('Provedor Gemini respondeu com status HTTP 401 super-secret'),
      );
      prisma.contentEnrichment.update.mockResolvedValue(failed);

      const result = await service.getOrCreateForContent(content.id);

      expect(result).toBe(failed);
      expect(prisma.contentEnrichment.update).toHaveBeenCalledWith({
        where: { id: processing.id },
        data: {
          status: EnrichmentStatus.FAILED,
          errorMessage:
            'Não foi possível gerar a versão resumida com IA no momento. Tente novamente mais tarde.',
        },
      });

      // A mensagem persistida é genérica — o detalhe técnico nunca contém a
      // chave, mas também não vaza nada sensível para o registro.
      const persisted = prisma.contentEnrichment.update.mock.calls[0][0].data
        .errorMessage as string;
      expect(persisted).not.toContain('super-secret');
    });

    it('does not call the AI on a concurrent create collision (P2002): yields to the winner', async () => {
      const content = createContent();
      const concurrent = createEnrichment({
        id: 'concurrent-1',
        status: EnrichmentStatus.PROCESSING,
      });
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
      expect(ai.enrichContent).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.update).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.findUnique).toHaveBeenCalledTimes(2);
    });

    it('does not call the AI when the compare-and-swap loses the race (count 0): yields to the winner', async () => {
      const content = createContent();
      const pending = createEnrichment({ status: EnrichmentStatus.PENDING });
      const winner = createEnrichment({
        id: 'winner-1',
        status: EnrichmentStatus.PROCESSING,
      });
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique
        .mockResolvedValueOnce(pending)
        .mockResolvedValueOnce(winner);
      prisma.contentEnrichment.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.getOrCreateForContent(content.id)).resolves.toBe(
        winner,
      );
      expect(ai.enrichContent).not.toHaveBeenCalled();
      expect(prisma.contentEnrichment.update).not.toHaveBeenCalled();
    });

    it('throws a clear error if the colliding record vanished on re-read (P2002 then null)', async () => {
      const content = createContent();
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.contentEnrichment.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          clientVersion: '7.8.0',
          code: 'P2002',
        }),
      );

      await expect(service.getOrCreateForContent(content.id)).rejects.toThrow(
        /Enriquecimento esperado não encontrado/,
      );
      expect(ai.enrichContent).not.toHaveBeenCalled();
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
      expect(ai.enrichContent).not.toHaveBeenCalled();
    });

    it('honors a custom language across lookup, fallback creation and the AI input', async () => {
      const content = createContent();
      contents.findById.mockResolvedValue(content);
      prisma.contentEnrichment.findUnique.mockResolvedValue(null);
      prisma.contentEnrichment.create.mockResolvedValue(
        createEnrichment({
          language: 'en',
          status: EnrichmentStatus.PROCESSING,
        }),
      );
      prisma.contentEnrichment.update.mockResolvedValue(
        createEnrichment({
          language: 'en',
          status: EnrichmentStatus.COMPLETED,
        }),
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
      expect(ai.enrichContent).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'en' }),
      );
    });
  });
});
