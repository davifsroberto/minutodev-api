import { Logger } from '@nestjs/common';

import {
  Content,
  ContentStatus,
  ContentType,
  Source,
  SourceType,
} from '@prisma/client';

import { ContentsService } from '../contents/contents.service';
import { RadarQueryDto } from './dto/radar-query.dto';
import { RADAR_MAX_DAILY_ITEMS, RadarService } from './radar.service';

type RadarContent = Content & { source: Source };
type ContentsServiceMock = Pick<
  ContentsService,
  'findEligibleForDay' | 'findMostRecentEligibleDay'
>;

const createSource = (overrides: Partial<Source> = {}): Source => ({
  category: 'engineering',
  createdAt: new Date('2026-06-13T12:00:00.000Z'),
  enabled: true,
  id: 'source-1',
  name: 'Example Source',
  type: SourceType.RSS,
  updatedAt: new Date('2026-06-13T12:00:00.000Z'),
  url: 'https://source.example.test',
  ...overrides,
});

const createContent = (
  overrides: Partial<Content> & { source?: Source } = {},
): RadarContent => {
  const { source, ...contentOverrides } = overrides;
  const id = contentOverrides.id ?? 'content-1';

  return {
    author: null,
    category: 'backend',
    collectedAt: new Date('2026-06-13T12:00:00.000Z'),
    contentType: ContentType.ARTICLE,
    createdAt: new Date('2026-06-13T12:00:00.000Z'),
    id,
    publishedAt: new Date('2026-06-13T11:00:00.000Z'),
    rawData: null,
    rawSummary: null,
    rawTitle: null,
    score: 0,
    source: source ?? createSource(),
    sourceId: 'source-1',
    status: ContentStatus.NEW,
    summary: null,
    tags: [],
    title: `Content ${id}`,
    updatedAt: new Date('2026-06-13T12:00:00.000Z'),
    url: `https://example.test/${id}`,
    ...contentOverrides,
  };
};

const createQuery = (overrides: Partial<RadarQueryDto> = {}): RadarQueryDto =>
  Object.assign(new RadarQueryDto(), overrides);

describe('RadarService', () => {
  let contents: {
    findEligibleForDay: jest.Mock<Promise<RadarContent[]>, [Date, number]>;
    findMostRecentEligibleDay: jest.Mock<Promise<Date | null>, [Date]>;
  };
  let service: RadarService;

  beforeEach(() => {
    contents = {
      findEligibleForDay: jest.fn<Promise<RadarContent[]>, [Date, number]>(),
      findMostRecentEligibleDay: jest.fn<Promise<Date | null>, [Date]>(),
    };
    contents.findMostRecentEligibleDay.mockResolvedValue(null);
    service = new RadarService(
      contents as ContentsServiceMock as ContentsService,
    );
  });

  const sectionItems = async (
    items: RadarContent[],
    query: Partial<RadarQueryDto> = {},
  ) => {
    contents.findEligibleForDay.mockResolvedValue(items);

    const response = await service.getToday(createQuery(query));

    return Object.fromEntries(
      response.sections.map((section) => [section.key, section.items]),
    );
  };

  it('assigns an item matching tools and trends only to tools', async () => {
    const sections = await sectionItems([
      createContent({
        category: 'ai',
        contentType: ContentType.TOOL,
        id: 'tool-ai',
      }),
    ]);

    expect(sections.tools).toHaveLength(1);
    expect(sections.tools?.[0]).toMatchObject({ id: 'tool-ai' });
    expect(sections.trends).toEqual([]);
    expect(sections.recommended).toEqual([]);
  });

  it('assigns a release in an engineering category only to releases', async () => {
    const sections = await sectionItems([
      createContent({
        category: 'engineering',
        contentType: ContentType.RELEASE,
        id: 'release-engineering',
      }),
    ]);

    expect(sections.releases).toHaveLength(1);
    expect(sections.releases?.[0]).toMatchObject({
      id: 'release-engineering',
    });
    expect(sections.trends).toEqual([]);
  });

  it('assigns opensource non-tool content to tools', async () => {
    const sections = await sectionItems([
      createContent({
        category: 'opensource',
        contentType: ContentType.ARTICLE,
        id: 'opensource-article',
      }),
    ]);

    expect(sections.tools).toHaveLength(1);
    expect(sections.tools?.[0]).toMatchObject({ id: 'opensource-article' });
  });

  it('assigns article content with null category to recommended', async () => {
    const sections = await sectionItems([
      createContent({
        category: null,
        contentType: ContentType.ARTICLE,
        id: 'uncategorized-article',
      }),
    ]);

    expect(sections.recommended).toHaveLength(1);
    expect(sections.recommended?.[0]).toMatchObject({
      id: 'uncategorized-article',
    });
  });

  it('preserves input order within each section', async () => {
    const sections = await sectionItems([
      createContent({ category: 'ai', id: 'trend-1' }),
      createContent({ category: 'engineering', id: 'trend-2' }),
      createContent({ category: 'community', id: 'trend-3' }),
    ]);

    expect(sections.trends?.map((item) => item.id)).toEqual([
      'trend-1',
      'trend-2',
      'trend-3',
    ]);
  });

  it('applies limitPerSection after assignment without affecting other sections', async () => {
    const sections = await sectionItems(
      [
        createContent({ category: 'ai', id: 'trend-1' }),
        createContent({ category: 'engineering', id: 'trend-2' }),
        createContent({ category: 'community', id: 'trend-3' }),
        createContent({ contentType: ContentType.TOOL, id: 'tool-1' }),
        createContent({ contentType: ContentType.TOOL, id: 'tool-2' }),
        createContent({ contentType: ContentType.TOOL, id: 'tool-3' }),
        createContent({ category: null, id: 'recommended-1' }),
      ],
      { limitPerSection: 2 },
    );

    expect(sections.trends?.map((item) => item.id)).toEqual([
      'trend-1',
      'trend-2',
    ]);
    expect(sections.tools?.map((item) => item.id)).toEqual([
      'tool-1',
      'tool-2',
    ]);
    expect(sections.recommended?.map((item) => item.id)).toEqual([
      'recommended-1',
    ]);
  });

  it('always returns all four sections in fixed order with empty arrays', async () => {
    contents.findEligibleForDay.mockResolvedValue([
      createContent({
        contentType: ContentType.RELEASE,
        id: 'release-1',
      }),
    ]);

    const response = await service.getToday(createQuery());

    expect(response.sections).toEqual([
      {
        items: [expect.objectContaining({ id: 'release-1' })],
        key: 'releases',
      },
      { items: [], key: 'tools' },
      { items: [], key: 'trends' },
      { items: [], key: 'recommended' },
    ]);
  });

  it.each([
    { expectedReadTime: 6, items: ['item-1', 'item-2', 'item-3'] },
    { expectedReadTime: 0, items: [] },
    {
      expectedReadTime: 15,
      items: Array.from({ length: 10 }, (_, index) => `item-${index + 1}`),
    },
  ])(
    'computes read time $expectedReadTime from returned item count',
    async ({ expectedReadTime, items }) => {
      contents.findEligibleForDay.mockResolvedValue(
        items.map((id) => createContent({ category: null, id })),
      );

      const response = await service.getToday(
        createQuery({ limitPerSection: 20 }),
      );

      expect(response.estimatedReadTimeMinutes).toBe(expectedReadTime);
    },
  );

  it('uses a provided date as the resolved UTC day', async () => {
    contents.findEligibleForDay.mockResolvedValue([]);

    const response = await service.getToday(
      createQuery({ date: '2026-05-20' }),
    );

    expect(response.date).toBe('2026-05-20');
    expect(contents.findEligibleForDay).toHaveBeenCalledWith(
      new Date('2026-05-20T00:00:00.000Z'),
      RADAR_MAX_DAILY_ITEMS,
    );
  });

  it('uses the injected clock when date is absent', async () => {
    contents.findEligibleForDay.mockResolvedValue([]);
    service.setNowProvider(() => new Date('2026-06-13T23:30:00.000Z'));

    const response = await service.getToday(createQuery());

    expect(response.date).toBe('2026-06-13');
    expect(contents.findEligibleForDay).toHaveBeenCalledWith(
      new Date('2026-06-13T00:00:00.000Z'),
      RADAR_MAX_DAILY_ITEMS,
    );
  });

  describe('most-recent fallback when the requested day is empty', () => {
    it('serves the most recent available day and reports its real date', async () => {
      const fallbackDay = new Date('2026-06-10T00:00:00.000Z');
      contents.findEligibleForDay
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          createContent({ category: 'ai', id: 'past-trend' }),
        ]);
      contents.findMostRecentEligibleDay.mockResolvedValue(fallbackDay);

      const response = await service.getToday(
        createQuery({ date: '2026-06-13' }),
      );

      expect(contents.findMostRecentEligibleDay).toHaveBeenCalledWith(
        new Date('2026-06-13T00:00:00.000Z'),
      );
      expect(contents.findEligibleForDay).toHaveBeenNthCalledWith(
        2,
        fallbackDay,
        RADAR_MAX_DAILY_ITEMS,
      );
      expect(response.date).toBe('2026-06-10');
      expect(
        response.sections.find((section) => section.key === 'trends')?.items,
      ).toEqual([expect.objectContaining({ id: 'past-trend' })]);
    });

    it('keeps the empty requested day when no earlier content exists', async () => {
      contents.findEligibleForDay.mockResolvedValue([]);
      contents.findMostRecentEligibleDay.mockResolvedValue(null);

      const response = await service.getToday(
        createQuery({ date: '2026-06-13' }),
      );

      expect(contents.findEligibleForDay).toHaveBeenCalledTimes(1);
      expect(response.date).toBe('2026-06-13');
      expect(response.estimatedReadTimeMinutes).toBe(0);
      expect(response.sections.every((section) => !section.items.length)).toBe(
        true,
      );
    });

    it('does not look for a fallback when the requested day has content', async () => {
      contents.findEligibleForDay.mockResolvedValue([
        createContent({ category: 'ai', id: 'today-trend' }),
      ]);

      const response = await service.getToday(
        createQuery({ date: '2026-06-13' }),
      );

      expect(contents.findMostRecentEligibleDay).not.toHaveBeenCalled();
      expect(response.date).toBe('2026-06-13');
    });
  });

  it('logs a warning when the daily defensive cap is hit', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    contents.findEligibleForDay.mockResolvedValue(
      Array.from({ length: RADAR_MAX_DAILY_ITEMS }, (_, index) =>
        createContent({ id: `item-${index}` }),
      ),
    );

    await service.getToday(createQuery({ date: '2026-06-13' }));

    expect(warn).toHaveBeenCalledWith(
      `Radar daily item cap hit for 2026-06-13 (${RADAR_MAX_DAILY_ITEMS} items).`,
    );
  });

  it('maps sourceName and exposes only radar card fields', async () => {
    contents.findEligibleForDay.mockResolvedValue([
      createContent({
        author: 'Internal Author',
        category: 'ai',
        id: 'mapped-item',
        rawTitle: 'Raw title',
        score: 42,
        source: createSource({ name: 'Flattened Source' }),
        status: ContentStatus.VISIBLE,
        summary: 'Mapped summary',
        tags: ['internal'],
      }),
    ]);

    const response = await service.getToday(createQuery());
    const item = response.sections[2].items[0];

    expect(item).toEqual({
      category: 'ai',
      contentType: ContentType.ARTICLE,
      id: 'mapped-item',
      publishedAt: new Date('2026-06-13T11:00:00.000Z'),
      sourceName: 'Flattened Source',
      summary: 'Mapped summary',
      title: 'Content mapped-item',
      url: 'https://example.test/mapped-item',
    });
    expect(item).not.toHaveProperty('status');
    expect(item).not.toHaveProperty('score');
    expect(item).not.toHaveProperty('tags');
    expect(item).not.toHaveProperty('sourceId');
    expect(item).not.toHaveProperty('collectedAt');
    expect(item).not.toHaveProperty('rawTitle');
    expect(item).not.toHaveProperty('rawSummary');
    expect(item).not.toHaveProperty('rawData');
  });
});
