import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ContentEnrichment, EnrichmentStatus } from '@prisma/client';

import { EnrichmentsController } from './enrichments.controller';
import { EnrichmentsService } from './enrichments.service';

type EnrichmentsServiceMock = {
  getOrCreateForContent: jest.Mock<Promise<ContentEnrichment>, [string]>;
};

const createEnrichment = (
  overrides: Partial<ContentEnrichment> = {},
): ContentEnrichment => ({
  briefContent: 'Resumo do conteúdo.',
  contentId: 'content-1',
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  errorMessage: null,
  id: 'enrichment-1',
  keyPoints: [],
  language: 'pt-BR',
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

describe('EnrichmentsController', () => {
  let controller: EnrichmentsController;
  let service: EnrichmentsServiceMock;

  beforeEach(async () => {
    service = {
      getOrCreateForContent: jest.fn<Promise<ContentEnrichment>, [string]>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnrichmentsController],
      providers: [{ provide: EnrichmentsService, useValue: service }],
    }).compile();

    controller = module.get(EnrichmentsController);
  });

  it('returns the enrichment resolved by the service for the given id', async () => {
    const enrichment = createEnrichment();
    service.getOrCreateForContent.mockResolvedValue(enrichment);

    await expect(controller.getEnrichment('content-1')).resolves.toBe(
      enrichment,
    );
    expect(service.getOrCreateForContent).toHaveBeenCalledWith('content-1');
  });

  it('propagates a NotFoundException raised by the service', async () => {
    service.getOrCreateForContent.mockRejectedValue(
      new NotFoundException('Content not found'),
    );

    await expect(controller.getEnrichment('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
