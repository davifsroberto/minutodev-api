import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  AuthProvider,
  ContentStatus,
  ContentType,
  EnrichmentStatus,
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
import { AUTH_COOKIE_NAME } from '../auth/auth.config';
import { ContentsService } from '../contents/contents.service';
import { InterestsService } from '../interests/interests.service';
import { RadarService } from './radar.service';
import { RelevanceService } from './relevance.service';

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
  sourceCount: number;
};

type RadarSectionResponse = {
  key: string;
  items: RadarItemResponse[];
};

type RadarResponse = {
  date: string;
  estimatedReadTimeMinutes: number;
  featuredId: string | null;
  sections: RadarSectionResponse[];
};

type RadarForYouResponse = RadarResponse & {
  personalized: boolean;
  personalizationFallback: boolean;
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
  'sourceCount',
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
  let relatedSource: Source;
  let cookieWithInterests: string;
  let cookieWithoutInterests: string;
  const emailWithInterests = `${runId}-with-interests@example.test`;
  const emailWithoutInterests = `${runId}-without-interests@example.test`;
  const currentNow = new Date('2099-09-15T14:00:00.000Z');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RadarService)
      .useFactory({
        factory: (
          contentsService: ContentsService,
          relevanceService: RelevanceService,
          interestsService: InterestsService,
        ) => {
          const service = new RadarService(
            contentsService,
            relevanceService,
            interestsService,
          );
          service.setNowProvider(() => currentNow);

          return service;
        },
        inject: [ContentsService, RelevanceService, InterestsService],
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
    relatedSource = await prisma.source.create({
      data: {
        name: `Related Radar Source ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/related-radar-source`,
        category: 'ai',
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
        publishedAt: sameDay(9),
        collectedAt: sameDay(9),
      }),
      // trends — pure ai / community categories on articles
      createContentData(source, runId, 'Node.js 22 runtime released', {
        contentType: ContentType.ARTICLE,
        category: 'ai',
        status: ContentStatus.NEW,
        publishedAt: sameDay(8),
        collectedAt: sameDay(8),
      }),
      createContentData(
        relatedSource,
        runId,
        'Node.js 22 runtime released today',
        {
          contentType: ContentType.ARTICLE,
          category: 'ai',
          status: ContentStatus.NEW,
          publishedAt: new Date('2099-09-15T07:30:00.000Z'),
          collectedAt: new Date('2099-09-15T07:30:00.000Z'),
        },
      ),
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

    const createdRows = await Promise.all(
      rows.map((data) => prisma.content.create({ data })),
    );
    const enrichedRelease = createdRows.find(
      (row) => row.title === 'release older',
    );

    if (enrichedRelease === undefined) {
      throw new Error('Missing enriched release fixture');
    }

    await prisma.contentEnrichment.create({
      data: {
        audienceFor: [],
        audienceIgnore: [],
        contentId: enrichedRelease.id,
        keyPoints: [],
        language: 'pt-BR',
        originalUrl: enrichedRelease.url,
        status: EnrichmentStatus.COMPLETED,
      },
    });

    // Usuários do for-you: um com interesse em 'community' (categoria da
    // fixture 'trend community') e outro sem interesses, para o fallback.
    // Upsert porque 'community' é tema canônico do catálogo (pode já ter sido
    // semeado); por isso ele também não é apagado no afterAll.
    await prisma.user.deleteMany({
      where: { email: { in: [emailWithInterests, emailWithoutInterests] } },
    });
    const communityTopic = await prisma.topic.upsert({
      where: { slug: 'community' },
      update: {},
      create: { slug: 'community', label: 'Comunidade' },
    });
    const userWithInterests = await prisma.user.create({
      data: {
        email: emailWithInterests,
        name: 'Radar Personalizado Integração',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: `${runId}-with-interests`,
        interests: { create: { topicId: communityTopic.id } },
      },
    });
    const userWithoutInterests = await prisma.user.create({
      data: {
        email: emailWithoutInterests,
        name: 'Radar Fallback Integração',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: `${runId}-without-interests`,
      },
    });

    const jwt = app.get(JwtService);
    cookieWithInterests = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: userWithInterests.id })}`;
    cookieWithoutInterests = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: userWithoutInterests.id })}`;
  });

  afterAll(async () => {
    await prisma.source.deleteMany({
      where: {
        url: {
          startsWith: `https://example.test/${runId}/`,
        },
      },
    });
    // O delete em cascata remove os UserInterest; o Topic fica (é catálogo).
    await prisma.user.deleteMany({
      where: { email: { in: [emailWithInterests, emailWithoutInterests] } },
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

    // RELEASE + 'engineering' lands in releases, not trends (dedup). The
    // enriched older release outranks the newer non-enriched release.
    expect(titlesOf(sectionByKey(body, 'releases'))).toEqual([
      'release older',
      'release newest',
    ]);
    // TOOL + 'ai' stays in tools (dedup); 'opensource' on an ARTICLE is tools.
    expect(titlesOf(sectionByKey(body, 'tools'))).toEqual([
      'tool by type',
      'tool by opensource category',
      'tool extra',
    ]);
    expect(titlesOf(sectionByKey(body, 'trends'))).toEqual([
      'Node.js 22 runtime released',
      'Node.js 22 runtime released today',
      'trend community',
    ]);
    expect(titlesOf(sectionByKey(body, 'recommended'))).toEqual([
      'recommended null category',
      'recommended other category',
    ]);
  });

  it('maps each item to the trimmed card contract with a flattened sourceName', async () => {
    const body = await getRadar();
    const release = sectionByKey(body, 'releases').items.find(
      (item) => item.title === 'release newest',
    );

    if (release === undefined) {
      throw new Error('Missing release fixture in radar response');
    }

    expect(Object.keys(release).sort()).toEqual(RADAR_ITEM_KEYS);
    expect(release).toEqual(
      expect.objectContaining({
        title: 'release newest',
        sourceName: source.name,
        imageUrl: 'https://cdn.example.test/release-newest.png',
        category: 'engineering',
        contentType: ContentType.RELEASE,
        sourceCount: 1,
        summary: null,
      }),
    );
  });

  it('returns featuredId inside the response and sourceCount from distinct topic sources', async () => {
    const body = await getRadar();
    const items = body.sections.flatMap((section) => section.items);
    const coveredItems = items.filter((item) =>
      item.title.startsWith('Node.js 22 runtime released'),
    );

    expect(body.featuredId).not.toBeNull();
    expect(items.some((item) => item.id === body.featuredId)).toBe(true);
    expect(coveredItems).toHaveLength(2);
    expect(coveredItems.map((item) => item.sourceCount)).toEqual([2, 2]);
    expect(items.every((item) => item.sourceCount >= 1)).toBe(true);
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

    // 10 eligible items -> 2 × 10 = 20, capped at 15.
    expect(allTitles(body)).toHaveLength(10);
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

  describe('GET /radar/for-you', () => {
    const getForYou = async (
      cookie: string,
      query = '',
    ): Promise<RadarForYouResponse> => {
      const response = await request(app.getHttpServer())
        .get(`/radar/for-you${query}`)
        .set('Cookie', cookie)
        .expect(200);

      return response.body as RadarForYouResponse;
    };

    it('rejects anonymous requests with the 401 envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/radar/for-you')
        .expect(401);

      expectErrorEnvelope(
        response.body as ErrorEnvelope,
        401,
        'UNAUTHORIZED',
        '/radar/for-you',
      );
    });

    it('boosts interest matches inside the section and in the featured slot', async () => {
      const general = await getRadar();
      const body = await getForYou(cookieWithInterests);
      const communityTrend = body.sections
        .flatMap((section) => section.items)
        .find((item) => item.title === 'trend community');

      expect(body.personalized).toBe(true);
      expect(body.personalizationFallback).toBe(false);

      // 'trend community' perde para os itens de IA no ranking editorial; com
      // o interesse em 'community' ele lidera a seção e assume o destaque.
      expect(titlesOf(sectionByKey(body, 'trends'))).toEqual([
        'trend community',
        'Node.js 22 runtime released',
        'Node.js 22 runtime released today',
      ]);
      expect(body.featuredId).toBe(communityTrend?.id);
      expect(body.featuredId).not.toBe(general.featuredId);
    });

    it('only re-ranks: same items, same section order, nothing hidden', async () => {
      const general = await getRadar();
      const body = await getForYou(cookieWithInterests);

      expect(body.sections.map((section) => section.key)).toEqual([
        'releases',
        'tools',
        'trends',
        'recommended',
      ]);
      expect(allTitles(body).sort()).toEqual(allTitles(general).sort());
      // Seções sem match de interesse mantêm a ordem editorial.
      expect(titlesOf(sectionByKey(body, 'releases'))).toEqual(
        titlesOf(sectionByKey(general, 'releases')),
      );
    });

    it('keeps the trimmed card contract without exposing the raw score', async () => {
      const body = await getForYou(cookieWithInterests);
      const item = sectionByKey(body, 'trends').items[0];

      expect(Object.keys(item).sort()).toEqual(RADAR_ITEM_KEYS);
      expect(Object.keys(body).sort()).toEqual([
        'date',
        'estimatedReadTimeMinutes',
        'featuredId',
        'personalizationFallback',
        'personalized',
        'sections',
      ]);
    });

    it('falls back to the general ranking for a user without interests', async () => {
      const general = await getRadar();
      const body = await getForYou(cookieWithoutInterests);

      expect(body.personalized).toBe(false);
      expect(body.personalizationFallback).toBe(true);
      expect(body.featuredId).toBe(general.featuredId);
      expect(body.sections).toEqual(general.sections);
    });

    it('honors the same query contract as the general radar', async () => {
      const body = await getForYou(cookieWithInterests, '?limitPerSection=1');

      for (const section of body.sections) {
        expect(section.items.length).toBeLessThanOrEqual(1);
      }
      expect(titlesOf(sectionByKey(body, 'trends'))).toEqual([
        'trend community',
      ]);

      const invalid = await request(app.getHttpServer())
        .get('/radar/for-you?limitPerSection=0')
        .set('Cookie', cookieWithInterests)
        .expect(400);

      expectErrorEnvelope(
        invalid.body as ErrorEnvelope,
        400,
        'BAD_REQUEST',
        '/radar/for-you?limitPerSection=0',
      );
    });
  });
});
