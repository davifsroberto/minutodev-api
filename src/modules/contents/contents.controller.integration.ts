import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContentStatus,
  ContentType,
  Prisma,
  PrismaClient,
  Source,
  SourceType,
} from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import { ContentsService } from './contents.service';

expand(loadEnv());

type SeedContent = {
  id: string;
  title: string;
  sourceId: string;
  category: string | null;
  status: ContentStatus;
};

type ContentResponse = SeedContent & {
  source?: {
    name: string;
    category: string;
    url: string;
  };
};

type PaginatedContentResponse = {
  data: ContentResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

const configureBootstrapGlobals = (app: INestApplication): void => {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('minutoDev API')
    .setDescription('minutoDev HTTP API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });
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

const createContentData = (
  source: Source,
  runId: string,
  title: string,
  overrides: Partial<Prisma.ContentUncheckedCreateInput> = {},
): Prisma.ContentUncheckedCreateInput => ({
  sourceId: source.id,
  title,
  url: `https://example.test/${runId}/${title.replaceAll(' ', '-')}`,
  publishedAt: new Date('2099-06-10T10:00:00.000Z'),
  collectedAt: new Date('2099-06-10T10:00:00.000Z'),
  category: source.category,
  tags: [],
  contentType: ContentType.ARTICLE,
  status: ContentStatus.NEW,
  ...overrides,
});

describe('ContentsController integration', () => {
  const runId = `contents-controller-${Date.now()}`;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let app: INestApplication;
  let backendSource: Source;
  let frontendSource: Source;
  let allSeedRows: SeedContent[];
  let detailRow: SeedContent;
  let currentNow = new Date('2099-06-13T14:00:00.000Z');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ContentsService)
      .useFactory({
        factory: (prismaService: PrismaService) => {
          const service = new ContentsService(prismaService);
          service.setNowProvider(() => currentNow);

          return service;
        },
        inject: [PrismaService],
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();
    await prisma.$connect();
    await prisma.source.deleteMany({
      where: {
        url: {
          startsWith: 'https://example.test/contents-controller-',
        },
      },
    });

    backendSource = await prisma.source.create({
      data: {
        name: `Backend Source ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/backend-source`,
        category: `backend-${runId}`,
      },
    });
    frontendSource = await prisma.source.create({
      data: {
        name: `Frontend Source ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/frontend-source`,
        category: `frontend-${runId}`,
      },
    });

    const created = await Promise.all([
      prisma.content.create({
        data: createContentData(backendSource, runId, 'newest visible', {
          publishedAt: new Date('2099-06-13T12:00:00.000Z'),
          collectedAt: new Date('2099-06-13T12:10:00.000Z'),
          status: ContentStatus.VISIBLE,
        }),
      }),
      prisma.content.create({
        data: createContentData(backendSource, runId, 'same published later', {
          publishedAt: new Date('2099-06-12T10:00:00.000Z'),
          collectedAt: new Date('2099-06-12T12:00:00.000Z'),
          status: ContentStatus.NEW,
        }),
      }),
      prisma.content.create({
        data: createContentData(
          frontendSource,
          runId,
          'same published earlier',
          {
            publishedAt: new Date('2099-06-12T10:00:00.000Z'),
            collectedAt: new Date('2099-06-12T11:00:00.000Z'),
            status: ContentStatus.HIDDEN,
          },
        ),
      }),
      prisma.content.create({
        data: createContentData(frontendSource, runId, 'old archived', {
          publishedAt: new Date('2099-06-11T10:00:00.000Z'),
          collectedAt: new Date('2099-06-11T10:00:00.000Z'),
          status: ContentStatus.ARCHIVED,
        }),
      }),
      prisma.content.create({
        data: createContentData(backendSource, runId, 'null published later', {
          publishedAt: null,
          collectedAt: new Date('2099-06-13T13:00:00.000Z'),
          status: ContentStatus.VISIBLE,
        }),
      }),
      prisma.content.create({
        data: createContentData(
          frontendSource,
          runId,
          'null published earlier',
          {
            publishedAt: null,
            collectedAt: new Date('2099-06-13T12:30:00.000Z'),
            status: ContentStatus.NEW,
          },
        ),
      }),
      ...Array.from({ length: 8 }, (_, index) =>
        prisma.content.create({
          data: createContentData(
            backendSource,
            runId,
            `pagination row ${index + 1}`,
            {
              publishedAt: new Date(`2099-06-0${index + 1}T10:00:00.000Z`),
              collectedAt: new Date(`2099-06-0${index + 1}T10:00:00.000Z`),
              status: ContentStatus.NEW,
            },
          ),
        }),
      ),
    ]);

    const rowsByTitle = new Map(
      created.map((content) => [
        content.title,
        {
          id: content.id,
          title: content.title,
          sourceId: content.sourceId,
          category: content.category,
          status: content.status,
        },
      ]),
    );
    const byTitle = (title: string): SeedContent => {
      const row = rowsByTitle.get(title);

      if (row === undefined) {
        throw new Error(`Missing seeded row ${title}`);
      }

      return row;
    };

    allSeedRows = Array.from(rowsByTitle.values());
    detailRow = byTitle('newest visible');
  });

  afterAll(async () => {
    await prisma.source.deleteMany({
      where: {
        url: {
          in: [
            `https://example.test/${runId}/backend-source`,
            `https://example.test/${runId}/frontend-source`,
          ],
        },
      },
    });
    await prisma.$disconnect();
    await app.close();
  });

  const getContents = async (query = ''): Promise<PaginatedContentResponse> => {
    const response = await request(app.getHttpServer())
      .get(`/contents${query}`)
      .expect(200);

    return response.body as PaginatedContentResponse;
  };

  it('serves GET /contents at the root with newest-first ordering and all statuses', async () => {
    const body = await getContents(`?source=${backendSource.id}&limit=20`);

    expect(body.data.map((content) => content.title)).toEqual([
      'newest visible',
      'same published later',
      'pagination row 8',
      'pagination row 7',
      'pagination row 6',
      'pagination row 5',
      'pagination row 4',
      'pagination row 3',
      'pagination row 2',
      'pagination row 1',
      'null published later',
    ]);
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 11,
      totalPages: 1,
    });

    const unfiltered = await getContents('?limit=20');
    expect(new Set(unfiltered.data.map((content) => content.status))).toEqual(
      new Set([
        ContentStatus.NEW,
        ContentStatus.VISIBLE,
        ContentStatus.HIDDEN,
        ContentStatus.ARCHIVED,
      ]),
    );
  });

  it('narrows GET /contents by category, source, status, and combinations', async () => {
    const category = await getContents(
      `?category=${frontendSource.category}&limit=20`,
    );
    expect(category.data.map((content) => content.title).sort()).toEqual(
      allSeedRows
        .filter((row) => row.category === frontendSource.category)
        .map((row) => row.title)
        .sort(),
    );

    const source = await getContents(`?source=${frontendSource.id}&limit=20`);
    expect(source.data.map((content) => content.title).sort()).toEqual(
      allSeedRows
        .filter((row) => row.sourceId === frontendSource.id)
        .map((row) => row.title)
        .sort(),
    );

    const status = await getContents('?status=VISIBLE&limit=20');
    expect(status.data.map((content) => content.title).sort()).toEqual(
      allSeedRows
        .filter((row) => row.status === ContentStatus.VISIBLE)
        .map((row) => row.title)
        .sort(),
    );

    const combination = await getContents(
      `?category=${backendSource.category}&status=VISIBLE&limit=20`,
    );
    expect(combination.data.map((content) => content.title).sort()).toEqual([
      'newest visible',
      'null published later',
    ]);
  });

  it('strips out-of-scope query params without changing the response', async () => {
    const unfiltered = await getContents(
      `?source=${backendSource.id}&limit=20`,
    );
    const withUnknownParams = await getContents(
      `?source=${backendSource.id}&limit=20&contentType=ARTICLE&tags=foo`,
    );

    expect(withUnknownParams).toEqual(unfiltered);
  });

  it.each([
    ['/contents?limit=101', 400, 'BAD_REQUEST'],
    ['/contents?limit=0', 400, 'BAD_REQUEST'],
    ['/contents?page=0', 400, 'BAD_REQUEST'],
    ['/contents?status=BOGUS', 400, 'BAD_REQUEST'],
  ])(
    'returns an error envelope for invalid query %s',
    async (path, status, error) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .expect(status);

      expectErrorEnvelope(response.body as ErrorEnvelope, status, error, path);
    },
  );

  it('returns the second page slice with requested page metadata', async () => {
    const body = await getContents(
      `?source=${backendSource.id}&page=2&limit=10`,
    );

    expect(body.data.map((content) => content.title)).toEqual([
      'null published later',
    ]);
    expect(body.meta).toEqual({
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
    });
  });

  it('returns only current UTC-day rows from GET /contents/today', async () => {
    const response = await request(app.getHttpServer())
      .get('/contents/today?limit=20')
      .expect(200);
    const body = response.body as PaginatedContentResponse;

    expect(body.data.map((content) => content.title)).toEqual([
      'newest visible',
      'null published later',
      'null published earlier',
    ]);
    expect(body.meta.total).toBe(3);
    expect(body.meta.totalPages).toBe(1);
  });

  it('returns a single content item with source details', async () => {
    const response = await request(app.getHttpServer())
      .get(`/contents/${detailRow.id}`)
      .expect(200);
    const body = response.body as ContentResponse;

    expect(body).toEqual(
      expect.objectContaining({
        id: detailRow.id,
        title: detailRow.title,
        source: expect.objectContaining({
          name: backendSource.name,
          category: backendSource.category,
          url: backendSource.url,
        }),
      }),
    );
  });

  it('returns a 404 envelope for an unknown content id', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const path = `/contents/${id}`;
    const response = await request(app.getHttpServer()).get(path).expect(404);

    expectErrorEnvelope(response.body as ErrorEnvelope, 404, 'NOT_FOUND', path);
  });

  it('returns an empty today response on a quiet UTC day', async () => {
    currentNow = new Date('2099-06-20T14:00:00.000Z');

    const response = await request(app.getHttpServer())
      .get('/contents/today')
      .expect(200);
    const body = response.body as PaginatedContentResponse;

    expect(body).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });
});
