import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  AUTHORITY_WEIGHT,
  COVERAGE_SATURATION,
  COVERAGE_WEIGHT,
  DEFAULT_AUTHORITY_WEIGHT,
  ENRICHMENT_WEIGHT,
  JACCARD_SIMILARITY_THRESHOLD,
  RECENCY_HALF_LIFE_HOURS,
  RECENCY_WEIGHT,
  SOURCE_AUTHORITY_WEIGHTS,
  TITLE_STOPWORDS,
} from './relevance.config';

const COMPONENT_WEIGHTS = [
  RECENCY_WEIGHT,
  AUTHORITY_WEIGHT,
  COVERAGE_WEIGHT,
  ENRICHMENT_WEIGHT,
];

const extractSeededSourceNames = (): string[] => {
  const seed = readFileSync(resolve(process.cwd(), 'prisma/seed.ts'), 'utf8');

  return [...seed.matchAll(/\bname:\s*'([^']+)'/g)].map((match) => match[1]);
};

describe('relevance config', () => {
  it('keeps component weights normalized with an exact sum of 1', () => {
    expect(
      COMPONENT_WEIGHTS.every((weight) => weight >= 0 && weight <= 1),
    ).toBe(true);
    expect(COMPONENT_WEIGHTS.reduce((sum, weight) => sum + weight, 0)).toBe(1);
  });

  it('defines authority weights for every source declared by the seed', () => {
    const seededSourceNames = extractSeededSourceNames();

    expect(seededSourceNames.length).toBeGreaterThan(0);
    expect(
      seededSourceNames.filter(
        (sourceName) => SOURCE_AUTHORITY_WEIGHTS[sourceName] === undefined,
      ),
    ).toEqual([]);
  });

  it('keeps authority scores normalized and provides a neutral fallback', () => {
    expect(DEFAULT_AUTHORITY_WEIGHT).toBe(0.5);
    expect(DEFAULT_AUTHORITY_WEIGHT).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_AUTHORITY_WEIGHT).toBeLessThanOrEqual(1);
    expect(
      Object.values(SOURCE_AUTHORITY_WEIGHTS).every(
        (weight) => weight >= 0 && weight <= 1,
      ),
    ).toBe(true);
  });

  it('defines valid scoring and grouping parameters', () => {
    expect(RECENCY_HALF_LIFE_HOURS).toBeGreaterThan(0);
    expect(JACCARD_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(JACCARD_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    expect(COVERAGE_SATURATION).toBeGreaterThan(1);
  });

  it('provides stopwords for Portuguese and English title normalization', () => {
    expect(TITLE_STOPWORDS).toEqual(
      expect.arrayContaining(['de', 'para', 'the', 'with']),
    );
  });
});
