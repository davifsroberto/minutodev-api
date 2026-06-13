import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContentStatus,
  ContentType,
  PrismaClient,
  SourceType,
} from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

expand(loadEnv());

describe('Content ordering index contract', () => {
  const runId = `ordering-index-${Date.now()}`;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.source.deleteMany({
      where: { url: `https://example.test/${runId}/source` },
    });
    await prisma.$disconnect();
  });

  it('orders published content newest-first and moves null publishedAt rows last', async () => {
    const source = await prisma.source.create({
      data: {
        name: `Ordering Index ${runId}`,
        type: SourceType.RSS,
        url: `https://example.test/${runId}/source`,
        category: 'integration',
      },
    });

    await prisma.content.createMany({
      data: [
        {
          sourceId: source.id,
          title: 'older published',
          url: `https://example.test/${runId}/older-published`,
          publishedAt: new Date('2026-06-11T10:00:00.000Z'),
          collectedAt: new Date('2026-06-13T14:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
        {
          sourceId: source.id,
          title: 'newest published',
          url: `https://example.test/${runId}/newest-published`,
          publishedAt: new Date('2026-06-13T10:00:00.000Z'),
          collectedAt: new Date('2026-06-13T13:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
        {
          sourceId: source.id,
          title: 'same published later collected',
          url: `https://example.test/${runId}/same-published-later-collected`,
          publishedAt: new Date('2026-06-12T10:00:00.000Z'),
          collectedAt: new Date('2026-06-13T16:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
        {
          sourceId: source.id,
          title: 'same published earlier collected',
          url: `https://example.test/${runId}/same-published-earlier-collected`,
          publishedAt: new Date('2026-06-12T10:00:00.000Z'),
          collectedAt: new Date('2026-06-13T15:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
        {
          sourceId: source.id,
          title: 'null published later collected',
          url: `https://example.test/${runId}/null-published-later-collected`,
          publishedAt: null,
          collectedAt: new Date('2026-06-13T18:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
        {
          sourceId: source.id,
          title: 'null published earlier collected',
          url: `https://example.test/${runId}/null-published-earlier-collected`,
          publishedAt: null,
          collectedAt: new Date('2026-06-13T17:00:00.000Z'),
          category: 'integration',
          tags: [],
          contentType: ContentType.ARTICLE,
          status: ContentStatus.NEW,
        },
      ],
    });

    const contents = await prisma.content.findMany({
      where: { sourceId: source.id },
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { collectedAt: 'desc' },
      ],
      select: { title: true, publishedAt: true, collectedAt: true },
    });

    expect(contents.map((content) => content.title)).toEqual([
      'newest published',
      'same published later collected',
      'same published earlier collected',
      'older published',
      'null published later collected',
      'null published earlier collected',
    ]);

    const firstNullIndex = contents.findIndex(
      (content) => content.publishedAt === null,
    );
    expect(firstNullIndex).toBeGreaterThan(0);
    expect(
      contents.slice(0, firstNullIndex).every((content) => content.publishedAt),
    ).toBe(true);
    expect(
      contents
        .slice(firstNullIndex)
        .every((content) => content.publishedAt === null),
    ).toBe(true);
    expect(contents.at(-2)?.collectedAt.getTime()).toBeGreaterThan(
      contents.at(-1)?.collectedAt.getTime() ?? 0,
    );
  });
});
