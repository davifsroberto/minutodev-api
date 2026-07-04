import { Logger } from '@nestjs/common';

import {
  Content,
  ContentStatus,
  ContentType,
  Source,
  SourceType,
} from '@prisma/client';

import {
  ContentsService,
  ContentTranslation,
} from '../contents/contents.service';
import { InterestsService } from '../interests/interests.service';
import { RadarQueryDto } from './dto/radar-query.dto';
import { RADAR_MAX_DAILY_ITEMS, RadarService } from './radar.service';
import { RelevanceService } from './relevance.service';

type RadarContent = Content & { source: Source };
type ContentsServiceMock = Pick<
  ContentsService,
  'findEligibleForDay' | 'findMostRecentEligibleDay' | 'findReadyTranslations'
>;
type InterestsServiceMock = Pick<InterestsService, 'getForUser'>;

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
    imageUrl: null,
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
    findReadyTranslations: jest.Mock<
      Promise<Map<string, ContentTranslation>>,
      [string[]]
    >;
  };
  let relevance: RelevanceService;
  let interests: { getForUser: jest.Mock<Promise<string[]>, [string]> };
  let service: RadarService;

  beforeEach(() => {
    contents = {
      findEligibleForDay: jest.fn<Promise<RadarContent[]>, [Date, number]>(),
      findMostRecentEligibleDay: jest.fn<Promise<Date | null>, [Date]>(),
      findReadyTranslations: jest.fn<
        Promise<Map<string, ContentTranslation>>,
        [string[]]
      >(),
    };
    contents.findMostRecentEligibleDay.mockResolvedValue(null);
    contents.findReadyTranslations.mockResolvedValue(new Map());
    relevance = new RelevanceService();
    interests = { getForUser: jest.fn<Promise<string[]>, [string]>() };
    interests.getForUser.mockResolvedValue([]);
    service = new RadarService(
      contents as ContentsServiceMock as ContentsService,
      relevance,
      interests as InterestsServiceMock as InterestsService,
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

  it('uses deterministic relevance order within each section', async () => {
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

  it('loads enrichment once for all candidates and reuses it for ranking and localization', async () => {
    const now = new Date('2026-06-13T14:00:00.000Z');
    const items = [
      createContent({ category: 'ai', id: 'localized' }),
      createContent({ category: 'ai', id: 'limited-out' }),
    ];
    contents.findEligibleForDay.mockResolvedValue(items);
    contents.findReadyTranslations.mockResolvedValue(
      new Map([
        [
          'localized',
          {
            translatedTitle: 'Título localizado',
            shortSummary: null,
            summary30s: null,
          },
        ],
      ]),
    );
    service.setNowProvider(() => now);
    const rank = jest.spyOn(relevance, 'rank');

    const response = await service.getToday(
      createQuery({ limitPerSection: 1 }),
    );

    expect(contents.findReadyTranslations).toHaveBeenCalledTimes(1);
    expect(contents.findReadyTranslations).toHaveBeenCalledWith([
      'localized',
      'limited-out',
    ]);
    // O 4º argumento (interesses) é sempre undefined no radar geral.
    expect(rank).toHaveBeenCalledWith(
      items,
      new Set(['localized']),
      now,
      undefined,
    );
    expect(response.sections[2].items[0].title).toBe('Título localizado');
  });

  it('sorts by score before applying the section limit and keeps featuredId present', async () => {
    const lower = createContent({
      category: 'ai',
      id: 'newer-lower-score',
      publishedAt: new Date('2026-06-13T12:00:00.000Z'),
    });
    const higher = createContent({
      category: 'ai',
      id: 'older-higher-score',
      publishedAt: new Date('2026-06-13T08:00:00.000Z'),
    });
    contents.findEligibleForDay.mockResolvedValue([lower, higher]);
    jest.spyOn(relevance, 'rank').mockReturnValue({
      featuredId: higher.id,
      signals: new Map([
        [lower.id, { score: 0.2, sourceCount: 1 }],
        [higher.id, { score: 0.9, sourceCount: 3 }],
      ]),
    });

    const response = await service.getToday(
      createQuery({ limitPerSection: 1 }),
    );

    expect(response.sections[2].items).toEqual([
      expect.objectContaining({
        id: higher.id,
        sourceCount: 3,
      }),
    ]);
    expect(response.featuredId).toBe(higher.id);
    expect(
      response.sections.some((section) =>
        section.items.some((item) => item.id === response.featuredId),
      ),
    ).toBe(true);
  });

  it('falls back to safe derived values when ranking omits a signal or a visible featured item', async () => {
    const item = createContent({ category: 'ai', id: 'visible' });
    contents.findEligibleForDay.mockResolvedValue([item]);
    jest.spyOn(relevance, 'rank').mockReturnValue({
      featuredId: 'missing',
      signals: new Map(),
    });

    const response = await service.getToday(createQuery());

    expect(response.sections[2].items[0].sourceCount).toBe(1);
    expect(response.featuredId).toBeNull();
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
        imageUrl: 'https://cdn.test/mapped.jpg',
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
      imageUrl: 'https://cdn.test/mapped.jpg',
      publishedAt: new Date('2026-06-13T11:00:00.000Z'),
      sourceCount: 1,
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

  it('reusa a tradução pt-BR quando há enrichment COMPLETED', async () => {
    contents.findEligibleForDay.mockResolvedValue([
      createContent({
        category: 'ai',
        id: 'localized',
        title: 'Raw English Title',
        summary: 'Raw english summary',
      }),
    ]);
    contents.findReadyTranslations.mockResolvedValue(
      new Map([
        [
          'localized',
          {
            translatedTitle: 'Título em português',
            shortSummary: 'Resumo em português',
            summary30s: null,
          },
        ],
      ]),
    );

    const response = await service.getToday(createQuery());
    const item = response.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.id === 'localized');

    expect(contents.findReadyTranslations).toHaveBeenCalledWith(['localized']);
    expect(item?.title).toBe('Título em português');
    expect(item?.summary).toBe('Resumo em português');
  });

  it('cai em summary30s e, sem traduções, no texto original do feed', async () => {
    contents.findEligibleForDay.mockResolvedValue([
      createContent({
        category: 'ai',
        id: 'partial',
        title: 'Raw Title',
        summary: 'Raw summary',
      }),
    ]);
    contents.findReadyTranslations.mockResolvedValue(
      new Map([
        [
          'partial',
          {
            translatedTitle: null,
            shortSummary: null,
            summary30s: 'Resumo de 30 segundos',
          },
        ],
      ]),
    );

    const response = await service.getToday(createQuery());
    const item = response.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.id === 'partial');

    // sem translatedTitle, mantém o título original; resumo cai no summary30s
    expect(item?.title).toBe('Raw Title');
    expect(item?.summary).toBe('Resumo de 30 segundos');
  });

  describe('getForYou', () => {
    const userId = 'user-1';

    // Gêmeos editoriais na mesma seção (trends): só o interesse desempata.
    const twins = () => [
      createContent({ category: 'engineering', id: 'twin-engineering' }),
      createContent({ category: 'ai', id: 'twin-ai' }),
    ];

    it('re-ranks items inside the section and the featured by interest, flagging personalized', async () => {
      contents.findEligibleForDay.mockResolvedValue(twins());
      // 'twin-engineering' perde o desempate por id no ranking geral; só o
      // boost de interesse pode colocá-lo na frente — o teste falha se o boost
      // não for aplicado.
      interests.getForUser.mockResolvedValue(['engineering']);

      const response = await service.getForYou(userId, createQuery());
      const trends = response.sections.find(
        (section) => section.key === 'trends',
      );

      expect(interests.getForUser).toHaveBeenCalledWith(userId);
      expect(trends?.items.map((item) => item.id)).toEqual([
        'twin-engineering',
        'twin-ai',
      ]);
      expect(response.featuredId).toBe('twin-engineering');
      expect(response.personalized).toBe(true);
      expect(response.personalizationFallback).toBe(false);
    });

    it('keeps section order fixed and hides nothing (boost only)', async () => {
      contents.findEligibleForDay.mockResolvedValue([
        ...twins(),
        createContent({
          contentType: ContentType.RELEASE,
          id: 'release-plain',
        }),
        createContent({ category: null, id: 'recommended-plain' }),
      ]);
      interests.getForUser.mockResolvedValue(['ai']);

      const response = await service.getForYou(userId, createQuery());

      expect(response.sections.map((section) => section.key)).toEqual([
        'releases',
        'tools',
        'trends',
        'recommended',
      ]);
      expect(
        response.sections.flatMap((section) =>
          section.items.map((item) => item.id),
        ),
      ).toEqual(
        expect.arrayContaining([
          'twin-ai',
          'twin-engineering',
          'release-plain',
          'recommended-plain',
        ]),
      );
    });

    it('degrades to the general ranking when the user has no interests', async () => {
      contents.findEligibleForDay.mockResolvedValue(twins());
      interests.getForUser.mockResolvedValue([]);
      const rank = jest.spyOn(relevance, 'rank');

      const forYou = await service.getForYou(userId, createQuery());
      const general = await service.getToday(createQuery());

      expect(forYou.personalized).toBe(false);
      expect(forYou.personalizationFallback).toBe(true);
      expect(forYou.sections).toEqual(general.sections);
      expect(forYou.featuredId).toBe(general.featuredId);
      expect(rank).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.any(Date),
        undefined,
      );
    });

    it('degrades to the general ranking when loading interests fails', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      contents.findEligibleForDay.mockResolvedValue(twins());
      interests.getForUser.mockRejectedValue(new Error('db offline'));

      const response = await service.getForYou(userId, createQuery());

      expect(response.personalized).toBe(false);
      expect(response.personalizationFallback).toBe(true);
      expect(response.sections.some((section) => section.items.length)).toBe(
        true,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load interests'),
      );
    });

    it('does not touch interests on the public getToday path', async () => {
      contents.findEligibleForDay.mockResolvedValue(twins());

      const response = await service.getToday(createQuery());

      expect(interests.getForUser).not.toHaveBeenCalled();
      expect(response).not.toHaveProperty('personalized');
      expect(response).not.toHaveProperty('personalizationFallback');
    });
  });
});
