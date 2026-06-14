import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContentStatus,
  ContentType,
  EnrichmentStatus,
  PrismaClient,
  Source,
  SourceType,
} from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { configureBootstrapGlobals } from '../../bootstrap';

expand(loadEnv());

// Testes de integração usam o provedor mock: determinístico, offline e sem
// custo, independentemente do LLM_PROVIDER/LLM_MODEL do .env local.
process.env.LLM_PROVIDER = 'mock';
delete process.env.LLM_MODEL;

type EnrichmentResponse = {
  id: string;
  contentId: string;
  language: string;
  translatedTitle: string | null;
  shortSummary: string | null;
  whyItMatters: string | null;
  keyPoints: string[];
  example: string | null;
  whenToUse: string | null;
  briefContent: string | null;
  originalUrl: string;
  imageUrl: string | null;
  sourceName: string;
  publishedAt: string | null;
  provider: string | null;
  model: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

const expectErrorEnvelope = (
  body: ErrorEnvelope,
  statusCode: number,
  error: string,
  path: string,
) => {
  expect(body).toEqual({
    statusCode,
    error,
    message: expect.anything(),
    path,
    timestamp: expect.any(String),
  });
  expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
};

describe('EnrichmentsController integration', () => {
  const runId = `enrichments-controller-${Date.now()}`;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let app: INestApplication;
  let source: Source;
  let summaryContentId: string;
  let nullSummaryContentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();
    await prisma.$connect();
    await prisma.source.deleteMany({
      where: {
        url: { startsWith: 'https://example.test/enrichments-controller-' },
      },
    });

    source = await prisma.source.create({
      data: {
        name: `Enrichment Source ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/source`,
        category: `enrichment-${runId}`,
      },
    });

    const withSummary = await prisma.content.create({
      data: {
        sourceId: source.id,
        title: 'TypeScript 5.7 lançado',
        url: `https://example.test/${runId}/ts-5-7`,
        summary: 'A nova versão traz melhorias no compilador.',
        category: source.category,
        tags: [],
        contentType: ContentType.RELEASE,
        status: ContentStatus.NEW,
        imageUrl: `https://example.test/${runId}/cover.png`,
        publishedAt: new Date('2099-09-15T10:00:00.000Z'),
        collectedAt: new Date('2099-09-15T10:00:00.000Z'),
      },
    });
    summaryContentId = withSummary.id;

    const withoutSummary = await prisma.content.create({
      data: {
        sourceId: source.id,
        title: 'Conteúdo sem resumo',
        url: `https://example.test/${runId}/no-summary`,
        summary: null,
        category: source.category,
        tags: [],
        contentType: ContentType.ARTICLE,
        status: ContentStatus.NEW,
        publishedAt: new Date('2099-09-15T11:00:00.000Z'),
        collectedAt: new Date('2099-09-15T11:00:00.000Z'),
      },
    });
    nullSummaryContentId = withoutSummary.id;
  });

  afterAll(async () => {
    await prisma.source.deleteMany({
      where: { url: `https://example.test/${runId}/source` },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const getEnrichment = async (
    contentId: string,
  ): Promise<EnrichmentResponse> => {
    const response = await request(app.getHttpServer())
      .get(`/contents/${contentId}/enrichment`)
      .expect(200);

    return response.body as EnrichmentResponse;
  };

  it('generates a COMPLETED enrichment via the configured provider on first access', async () => {
    const body = await getEnrichment(summaryContentId);

    expect(body).toEqual(
      expect.objectContaining({
        contentId: summaryContentId,
        language: 'pt-BR',
        // o provedor mock prefixa o título original com [pt-BR]
        translatedTitle: '[pt-BR] TypeScript 5.7 lançado',
        originalUrl: `https://example.test/${runId}/ts-5-7`,
        // metadados do hero compostos a partir do Content/Source
        imageUrl: `https://example.test/${runId}/cover.png`,
        sourceName: `Enrichment Source ${runId}`,
        provider: 'mock',
        model: null,
        status: EnrichmentStatus.COMPLETED,
        errorMessage: null,
      }),
    );
    expect(typeof body.id).toBe('string');
    expect(body.whyItMatters).not.toBeNull();
    expect(body.keyPoints.length).toBeGreaterThan(0);
    // novos campos editoriais (mock os preenche)
    expect(body.example).not.toBeNull();
    expect(body.whenToUse).not.toBeNull();
    expect(body.publishedAt).toBe('2099-09-15T10:00:00.000Z');

    const stored = await prisma.contentEnrichment.findMany({
      where: { contentId: summaryContentId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(body.id);
  });

  it('serves the persisted enrichment from the DB on repeat access, without regenerating', async () => {
    const first = await getEnrichment(summaryContentId);
    const second = await getEnrichment(summaryContentId);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe(EnrichmentStatus.COMPLETED);
    // sem regeneração: o registro não é tocado de novo (updatedAt estável)
    expect(second.updatedAt).toBe(first.updatedAt);

    const stored = await prisma.contentEnrichment.findMany({
      where: { contentId: summaryContentId },
    });
    expect(stored).toHaveLength(1);
  });

  it('completes generation even when the content has no summary', async () => {
    const body = await getEnrichment(nullSummaryContentId);

    expect(body.translatedTitle).toBe('[pt-BR] Conteúdo sem resumo');
    expect(body.status).toBe(EnrichmentStatus.COMPLETED);
    // sem resumo de origem, o mock gera um texto de exemplo (não nulo)
    expect(body.shortSummary).not.toBeNull();
    expect(body.briefContent).not.toBeNull();
  });

  it('returns a 404 envelope for an unknown content id without persisting anything', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const path = `/contents/${id}/enrichment`;
    const response = await request(app.getHttpServer()).get(path).expect(404);

    expectErrorEnvelope(response.body as ErrorEnvelope, 404, 'NOT_FOUND', path);

    const stored = await prisma.contentEnrichment.findMany({
      where: { contentId: id },
    });
    expect(stored).toHaveLength(0);
  });
});
