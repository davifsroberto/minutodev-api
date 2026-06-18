import {
  Content,
  ContentStatus,
  ContentType,
  Source,
  SourceType,
} from '@prisma/client';

import {
  AUTHORITY_WEIGHT,
  COVERAGE_SATURATION,
  COVERAGE_WEIGHT,
  DEFAULT_AUTHORITY_WEIGHT,
  ENRICHMENT_WEIGHT,
  RECENCY_HALF_LIFE_HOURS,
  RECENCY_WEIGHT,
  SOURCE_AUTHORITY_WEIGHTS,
} from './relevance.config';
import {
  calculateAuthorityScore,
  calculateCoverageScore,
  calculateEnrichmentScore,
  calculateRecencyScore,
  calculateRelevanceScore,
  compareRelevanceCandidates,
  RadarContent,
  RelevanceCandidate,
  RelevanceService,
} from './relevance.service';

const NOW = new Date('2026-06-17T12:00:00.000Z');

const createSource = (overrides: Partial<Source> = {}): Source => ({
  category: 'engineering',
  createdAt: NOW,
  enabled: true,
  id: 'source-1',
  name: 'OpenAI',
  type: SourceType.RSS,
  updatedAt: NOW,
  url: 'https://source.example.test',
  ...overrides,
});

const createContent = (
  overrides: Partial<Content> & { source?: Source } = {},
): RadarContent => {
  const { source, ...contentOverrides } = overrides;
  const id = contentOverrides.id ?? 'content-1';
  const resolvedSource = source ?? createSource();

  return {
    author: null,
    category: 'engineering',
    collectedAt: NOW,
    contentType: ContentType.ARTICLE,
    createdAt: NOW,
    id,
    imageUrl: null,
    publishedAt: NOW,
    rawData: null,
    rawSummary: null,
    rawTitle: null,
    score: 0,
    source: resolvedSource,
    sourceId: resolvedSource.id,
    status: ContentStatus.NEW,
    summary: null,
    tags: [],
    title: `Topic ${id}`,
    updatedAt: NOW,
    url: `https://example.test/${id}`,
    ...contentOverrides,
  };
};

const candidate = (
  id: string,
  score: number,
  sourceCount: number,
  publishedAt: Date | null,
): RelevanceCandidate => ({
  item: createContent({ id, publishedAt }),
  signal: { score, sourceCount },
});

describe('relevance score components', () => {
  it('decays recency from the configured reference date and favors newer items', () => {
    const halfLifeOld = new Date(
      NOW.getTime() - RECENCY_HALF_LIFE_HOURS * 60 * 60 * 1000,
    );
    const newer = new Date(NOW.getTime() - 60 * 60 * 1000);

    expect(calculateRecencyScore(newer, halfLifeOld, NOW)).toBeGreaterThan(
      calculateRecencyScore(halfLifeOld, NOW, NOW),
    );
    expect(calculateRecencyScore(halfLifeOld, NOW, NOW)).toBeCloseTo(
      Math.exp(-1),
    );
    expect(calculateRecencyScore(null, halfLifeOld, NOW)).toBeCloseTo(
      Math.exp(-1),
    );
    expect(
      calculateRecencyScore(new Date(NOW.getTime() + 60 * 60 * 1000), NOW, NOW),
    ).toBe(1);
  });

  it('uses configured authority and the neutral fallback for unknown sources', () => {
    expect(calculateAuthorityScore('OpenAI')).toBe(
      SOURCE_AUTHORITY_WEIGHTS.OpenAI,
    );
    expect(calculateAuthorityScore('Unknown Source')).toBe(
      DEFAULT_AUTHORITY_WEIGHT,
    );
  });

  it('grows coverage from zero until the configured saturation point', () => {
    expect(calculateCoverageScore(1)).toBe(0);
    expect(calculateCoverageScore(2)).toBeGreaterThan(0);
    expect(calculateCoverageScore(COVERAGE_SATURATION)).toBe(1);
    expect(calculateCoverageScore(COVERAGE_SATURATION + 1)).toBe(1);
  });

  it('boosts only ids present in the enrichment set', () => {
    const enrichedIds = new Set(['enriched']);

    expect(calculateEnrichmentScore('enriched', enrichedIds)).toBe(1);
    expect(calculateEnrichmentScore('plain', enrichedIds)).toBe(0);
  });

  it('combines normalized components with the configured weights', () => {
    expect(
      calculateRelevanceScore({
        authority: 0.8,
        coverage: 0.6,
        enrichment: 1,
        recency: 0.4,
      }),
    ).toBeCloseTo(
      AUTHORITY_WEIGHT * 0.8 +
        COVERAGE_WEIGHT * 0.6 +
        ENRICHMENT_WEIGHT +
        RECENCY_WEIGHT * 0.4,
    );
  });
});

describe('RelevanceService', () => {
  const service = new RelevanceService();

  it('returns empty signals and no featured item for an empty candidate set', () => {
    const ranking = service.rank([], new Set(), NOW);

    expect(ranking.featuredId).toBeNull();
    expect(ranking.signals.size).toBe(0);
  });

  it('combines topic coverage and enrichment to select the highest global score', () => {
    const items = [
      createContent({
        id: 'plain',
        source: createSource({
          id: 'source-plain',
          name: 'Unknown Source',
        }),
        title: 'PostgreSQL logical replication guide',
      }),
      createContent({
        id: 'covered-a',
        source: createSource({ id: 'source-a', name: 'Dev.to' }),
        title: 'Node.js 22 runtime released',
      }),
      createContent({
        id: 'covered-b',
        source: createSource({ id: 'source-b', name: 'Dev.to' }),
        title: 'Node.js 22 runtime released today',
      }),
    ];

    const ranking = service.rank(items, new Set(['covered-b']), NOW);

    expect(ranking.signals.get('plain')?.sourceCount).toBe(1);
    expect(ranking.signals.get('covered-a')?.sourceCount).toBe(2);
    expect(ranking.signals.get('covered-b')?.sourceCount).toBe(2);
    expect(ranking.signals.get('covered-b')?.score).toBeGreaterThan(
      ranking.signals.get('covered-a')?.score ?? 0,
    );
    expect(ranking.featuredId).toBe('covered-b');
    expect(items.map(({ id }) => id)).toEqual([
      'plain',
      'covered-a',
      'covered-b',
    ]);
  });

  it('is deterministic for the same inputs', () => {
    const items = [
      createContent({ id: 'b', title: 'Independent beta topic' }),
      createContent({ id: 'a', title: 'Independent alpha topic' }),
    ];

    const first = service.rank(items, new Set(), NOW);
    const second = service.rank(items, new Set(), NOW);

    expect(first.featuredId).toBe('a');
    expect([...first.signals]).toEqual([...second.signals]);
    expect(first.featuredId).toBe(second.featuredId);
  });
});

describe('compareRelevanceCandidates', () => {
  it('orders by score, source count, newest published date, then id', () => {
    const older = new Date('2026-06-16T10:00:00.000Z');
    const newer = new Date('2026-06-16T11:00:00.000Z');
    const candidates = [
      candidate('z-score', 0.9, 1, older),
      candidate('z-sources', 0.8, 3, older),
      candidate('z-date', 0.8, 2, newer),
      candidate('b-id', 0.8, 2, older),
      candidate('a-id', 0.8, 2, older),
      candidate('null-date', 0.8, 2, null),
    ];

    expect(
      candidates.sort(compareRelevanceCandidates).map(({ item }) => item.id),
    ).toEqual(['z-score', 'z-sources', 'z-date', 'a-id', 'b-id', 'null-date']);
  });
});
