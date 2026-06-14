import { INestApplication } from '@nestjs/common';
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
import { configureBootstrapGlobals } from '../../bootstrap';
import { ContentsService } from '../contents/contents.service';
import { RadarService } from './radar.service';

expand(loadEnv());

type RadarItemResponse = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  sourceName: string;
  imageUrl: string | null;
  category: string | null;
  contentType: ContentType;
  publishedAt: string | null;
};

type RadarSectionResponse = {
  key: string;
  items: RadarItemResponse[];
};

type RadarResponse = {
  date: string;
  sections: RadarSectionResponse[];
  estimatedReadTimeMinutes: number;
};

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

const RADAR_ITEM_KEYS = [
  'category',
  'contentType',
  'id',
  'imageUrl',
  'publishedAt',
  'sourceName',
  'summary',
  'title',
  'url',
];

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
  publishedAt: new Date('2099-09-15T10:00:00.000Z'),
  collectedAt: new Date('2099-09-15T10:00:00.000Z'),
  category: source.category,
  tags: [],
  contentType: ContentType.ARTICLE,
  status: ContentStatus.NEW,
  ...overrides,
});

// A fixed "today" on a date no other integration test seeds (others use
// 2099-06 / 2026-06), so `findEligibleForDay` — which scans the whole table
// for the day window without a source filter — sees only these rows.
const sameDay = (hours: number): Date =>
  new Date(`2099-09-15T${String(hours).padStart(2, '0')}:00:00.000Z`);
const pastDay = (hours: number): Date =>
  new Date(`2099-09-10T${String(hours).padStart(2, '0')}:00:00.000Z`);

describe('RadarController integration', () => {
  const runId = `radar-controller-${Date.now()}`;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const allowedOrigin = 'http://localhost:4500';
  const disallowedOrigin = 'http://disallowed.example.test';
  let previousCorsOrigins: string | undefined;
  let app: INestApplication;
  let source: Source;
  const currentNow = new Date('2099-09-15T14:00:00.000Z');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RadarService)
      .useFactory({
        factory: (contentsService: ContentsService) => {
          const service = new RadarService(contentsService);
          service.setNowProvider(() => currentNow);

          return service;
        },
        inject: [ContentsService],
      })
      .compile();

    previousCorsOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = allowedOrigin;

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();
    await prisma.$connect();
    await prisma.source.deleteMany({
      where: {
        url: {
          startsWith: 'https://example.test/radar-controller-',
        },
      },
    });

    source = await prisma.source.create({
      data: {
        name: `Radar Source ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/radar-source`,
        category: `radar-${runId}`,
      },
    });

    const rows: Prisma.ContentUncheckedCreateInput[] = [
      // releases — RELEASE wins over its trends-eligible category (dedup)
      createContentData(source, runId, 'release newest', {
        contentType: ContentType.RELEASE,
        category: 'engineering',
        imageUrl: 'https://cdn.example.test/release-newest.png',
        status: ContentStatus.NEW,
        publishedAt: sameDay(12),
        collectedAt: sameDay(12),
      }),
      createContentData(source, runId, 'release older', {
        contentType: ContentType.RELEASE,
        category: null,
        status: ContentStatus.VISIBLE,
        publishedAt: sameDay(9),
        collectedAt: sameDay(9),
      }),
      // excluded: HIDDEN, even though it would be the newest release
      createContentData(source, runId, 'release hidden', {
        contentType: ContentType.RELEASE,
        category: 'engineering',
        status: ContentStatus.HIDDEN,
        publishedAt: sameDay(13),
        collectedAt: sameDay(13),
      }),
      // tools — TOOL by type (also ai → dedup keeps it in tools), opensource
      // category on a non-TOOL type, and a third to exercise limitPerSection
      createContentData(source, runId, 'tool by type', {
        contentType: ContentType.TOOL,
        category: 'ai',
        status: ContentStatus.NEW,
        publishedAt: sameDay(11),
        collectedAt: sameDay(11),
      }),
      createContentData(source, runId, 'tool by opensource category', {
        contentType: ContentType.ARTICLE,
        category: 'opensource',
        status: ContentStatus.VISIBLE,
        publishedAt: sameDay(10),
        collectedAt: new Date('2099-09-15T10:30:00.000Z'),
      }),
      createContentData(source, runId, 'tool extra', {
        contentType: ContentType.TOOL,
        category: null,
        status: ContentStatus.NEW,
        publishedAt: sameDay(10),
        collectedAt: sameDay(10),
      }),
      // trends — pure ai / community categories on articles
      createContentData(source, runId, 'trend ai', {
        contentType: ContentType.ARTICLE,
        category: 'ai',
        status: ContentStatus.NEW,
        publishedAt: sameDay(8),
        collectedAt: sameDay(8),
      }),
      createContentData(source, runId, 'trend community', {
        contentType: ContentType.ARTICLE,
        category: 'community',
        status: ContentStatus.VISIBLE,
        publishedAt: sameDay(7),
        collectedAt: sameDay(7),
      }),
      // recommended — catch-all: null category and a non-trend category
      createContentData(source, runId, 'recommended null category', {
        contentType: ContentType.ARTICLE,
        category: null,
        status: ContentStatus.NEW,
        publishedAt: sameDay(6),
        collectedAt: sameDay(6),
      }),
      createContentData(source, runId, 'recommended other category', {
        contentType: ContentType.ARTICLE,
        category: 'backend',
        status: ContentStatus.VISIBLE,
        publishedAt: sameDay(5),
        collectedAt: sameDay(5),
      }),
      // excluded: ARCHIVED, even though it would outrank recommended rows
      createContentData(source, runId, 'archived recommended', {
        contentType: ContentType.ARTICLE,
        category: null,
        status: ContentStatus.ARCHIVED,
        publishedAt: new Date('2099-09-15T06:30:00.000Z'),
        collectedAt: new Date('2099-09-15T06:30:00.000Z'),
      }),
      // a separate, earlier day for the `date` parameter test
      createContentData(source, runId, 'past release', {
        contentType: ContentType.RELEASE,
        category: null,
        status: ContentStatus.NEW,
        publishedAt: pastDay(10),
        collectedAt: pastDay(10),
      }),
      createContentData(source, runId, 'past tool', {
        contentType: ContentType.TOOL,
        category: null,
        status: ContentStatus.VISIBLE,
        publishedAt: pastDay(9),
        collectedAt: pastDay(9),
      }),
      createContentData(source, runId, 'past trend', {
        contentType: ContentType.ARTICLE,
        category: 'ai',
        status: ContentStatus.NEW,
        publishedAt: pastDay(8),
        collectedAt: pastDay(8),
      }),
    ];

    await Promise.all(rows.map((data) => prisma.content.create({ data })));
  });

  afterAll(async () => {
    await prisma.source.deleteMany({
      where: {
        url: `https://example.test/${runId}/radar-source`,
      },
    });
    await prisma.$disconnect();
    await app.close();

    if (previousCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = previousCorsOrigins;
    }
  });

  const getRadar = async (query = ''): Promise<RadarResponse> => {
    const response = await request(app.getHttpServer())
      .get(`/radar/today${query}`)
      .expect(200);

    return response.body as RadarResponse;
  };

  const sectionByKey = (
    body: RadarResponse,
    key: string,
  ): RadarSectionResponse => {
    const section = body.sections.find((entry) => entry.key === key);

    if (section === undefined) {
      throw new Error(`Missing radar section ${key}`);
    }

    return section;
  };

  const titlesOf = (section: RadarSectionResponse): string[] =>
    section.items.map((item) => item.title);

  const allTitles = (body: RadarResponse): string[] =>
    body.sections.flatMap((section) => titlesOf(section));

  it('composes four ordered sections with single-section priority dedup', async () => {
    const body = await getRadar();

    expect(body.date).toBe('2099-09-15');
    expect(body.sections.map((section) => section.key)).toEqual([
      'releases',
      'tools',
      'trends',
      'recommended',
    ]);

    // RELEASE + 'engineering' lands in releases, not trends (dedup); ordering
    // is newest-first by publishedAt.
    expect(titlesOf(sectionByKey(body, 'releases'))).toEqual([
      'release newest',
      'release older',
    ]);
    // TOOL + 'ai' stays in tools (dedup); 'opensource' on an ARTICLE is tools.
    expect(titlesOf(sectionByKey(body, 'tools'))).toEqual([
      'tool by type',
      'tool by opensource category',
      'tool extra',
    ]);
    expect(titlesOf(sectionByKey(body, 'trends'))).toEqual([
      'trend ai',
      'trend community',
    ]);
    expect(titlesOf(sectionByKey(body, 'recommended'))).toEqual([
      'recommended null category',
      'recommended other category',
    ]);
  });

  it('maps each item to the trimmed card contract with a flattened sourceName', async () => {
    const body = await getRadar();
    const [release] = sectionByKey(body, 'releases').items;

    expect(Object.keys(release).sort()).toEqual(RADAR_ITEM_KEYS);
    expect(release).toEqual(
      expect.objectContaining({
        title: 'release newest',
        sourceName: source.name,
        imageUrl: 'https://cdn.example.test/release-newest.png',
        category: 'engineering',
        contentType: ContentType.RELEASE,
        summary: null,
      }),
    );
  });

  it('excludes HIDDEN and ARCHIVED content from every section', async () => {
    const body = await getRadar();

    expect(allTitles(body)).not.toContain('release hidden');
    expect(allTitles(body)).not.toContain('archived recommended');
  });

  it('caps every section at limitPerSection while keeping the newest items', async () => {
    const body = await getRadar('?limitPerSection=2');

    for (const section of body.sections) {
      expect(section.items.length).toBeLessThanOrEqual(2);
    }
    // tools had three eligible items; only the two newest survive the bound.
    expect(titlesOf(sectionByKey(body, 'tools'))).toEqual([
      'tool by type',
      'tool by opensource category',
    ]);
    // 8 items returned across sections -> min(15, 16) = 15.
    expect(body.estimatedReadTimeMinutes).toBe(15);
  });

  it('caps estimatedReadTimeMinutes at 15 for the full briefing', async () => {
    const body = await getRadar();

    // 9 eligible items -> 2 × 9 = 18, capped at 15.
    expect(allTitles(body)).toHaveLength(9);
    expect(body.estimatedReadTimeMinutes).toBe(15);
  });

  it('returns the briefing for a past day when date is provided', async () => {
    const body = await getRadar('?date=2099-09-10');

    expect(body.date).toBe('2099-09-10');
    expect(titlesOf(sectionByKey(body, 'releases'))).toEqual(['past release']);
    expect(titlesOf(sectionByKey(body, 'tools'))).toEqual(['past tool']);
    expect(titlesOf(sectionByKey(body, 'trends'))).toEqual(['past trend']);
    expect(titlesOf(sectionByKey(body, 'recommended'))).toEqual([]);
    // the current-day rows must not leak into a past-day briefing
    expect(allTitles(body)).not.toContain('release newest');
    // 3 items -> 2 × 3 = 6, below the cap.
    expect(body.estimatedReadTimeMinutes).toBe(6);
  });

  it('falls back to the most recent available briefing when the requested day is empty', async () => {
    // 2099-09-20 has no content; the most recent eligible day is 2099-09-15,
    // so the endpoint serves that briefing while reporting its real date.
    const body = await getRadar('?date=2099-09-20');

    expect(body.date).toBe('2099-09-15');
    expect(titlesOf(sectionByKey(body, 'releases'))).toContain(
      'release newest',
    );
    expect(allTitles(body).length).toBeGreaterThan(0);
    expect(body.estimatedReadTimeMinutes).toBeGreaterThan(0);
    // the requested empty day must not leak into the served briefing's date
    expect(body.date).not.toBe('2099-09-20');
  });

  it.each([
    ['/radar/today?date=2099/09/15', 400, 'BAD_REQUEST'],
    ['/radar/today?date=15-09-2099', 400, 'BAD_REQUEST'],
    ['/radar/today?limitPerSection=0', 400, 'BAD_REQUEST'],
    ['/radar/today?limitPerSection=21', 400, 'BAD_REQUEST'],
    ['/radar/today?limitPerSection=abc', 400, 'BAD_REQUEST'],
  ])(
    'returns an error envelope for invalid query %s',
    async (path, status, error) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .expect(status);

      expectErrorEnvelope(response.body as ErrorEnvelope, status, error, path);
    },
  );

  it('allows the configured origin via CORS on GET /radar/today', async () => {
    const response = await request(app.getHttpServer())
      .get('/radar/today')
      .set('Origin', allowedOrigin)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
  });

  it('does not echo a disallowed origin in Access-Control-Allow-Origin', async () => {
    const response = await request(app.getHttpServer())
      .get('/radar/today')
      .set('Origin', disallowedOrigin)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).not.toBe(
      disallowedOrigin,
    );
  });
});
