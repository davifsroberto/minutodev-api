import { Injectable } from '@nestjs/common';

import { Content, Source } from '@prisma/client';

import {
  AUTHORITY_WEIGHT,
  COVERAGE_SATURATION,
  COVERAGE_WEIGHT,
  DEFAULT_AUTHORITY_WEIGHT,
  ENRICHMENT_WEIGHT,
  INTEREST_WEIGHT,
  RECENCY_HALF_LIFE_HOURS,
  RECENCY_WEIGHT,
  SOURCE_AUTHORITY_WEIGHTS,
} from './relevance.config';
import { getSourceCountByItemId } from './topic-grouping.util';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export type RadarContent = Content & { source: Source };

export interface RelevanceSignal {
  score: number;
  sourceCount: number;
}

export interface RelevanceRanking {
  signals: ReadonlyMap<string, RelevanceSignal>;
  featuredId: string | null;
}

export interface RelevanceComponents {
  recency: number;
  authority: number;
  coverage: number;
  enrichment: number;
  /** Sinal do radar personalizado; ausente/0 mantém o score editorial puro. */
  interest?: number;
}

export interface RelevanceCandidate {
  item: RadarContent;
  signal: RelevanceSignal;
}

export const calculateRecencyScore = (
  publishedAt: Date | null,
  collectedAt: Date,
  now: Date,
): number => {
  const referenceDate = publishedAt ?? collectedAt;
  const ageHours = Math.max(
    0,
    (now.getTime() - referenceDate.getTime()) / MILLISECONDS_PER_HOUR,
  );

  return Math.exp(-ageHours / RECENCY_HALF_LIFE_HOURS);
};

export const calculateAuthorityScore = (sourceName: string): number =>
  SOURCE_AUTHORITY_WEIGHTS[sourceName] ?? DEFAULT_AUTHORITY_WEIGHT;

export const calculateCoverageScore = (sourceCount: number): number =>
  Math.min(1, Math.max(0, sourceCount - 1) / (COVERAGE_SATURATION - 1));

export const calculateEnrichmentScore = (
  id: string,
  enrichedIds: ReadonlySet<string>,
): number => (enrichedIds.has(id) ? 1 : 0);

// Binário de propósito: `category` é único por conteúdo, então "casou um
// interesse" já é o sinal inteiro. `tags` está sempre vazio na ingestão atual
// e entra aqui como sinal futuro, sem custo hoje.
export const calculateInterestScore = (
  item: Pick<Content, 'category' | 'tags'>,
  interestSlugs: ReadonlySet<string>,
): number => {
  if (item.category !== null && interestSlugs.has(item.category)) return 1;

  return item.tags.some((tag) => interestSlugs.has(tag)) ? 1 : 0;
};

export const calculateRelevanceScore = ({
  recency,
  authority,
  coverage,
  enrichment,
  interest = 0,
}: RelevanceComponents): number =>
  RECENCY_WEIGHT * recency +
  AUTHORITY_WEIGHT * authority +
  COVERAGE_WEIGHT * coverage +
  ENRICHMENT_WEIGHT * enrichment +
  INTEREST_WEIGHT * interest;

export const compareRelevanceCandidates = (
  left: RelevanceCandidate,
  right: RelevanceCandidate,
): number => {
  const scoreDifference = right.signal.score - left.signal.score;
  if (scoreDifference !== 0) return scoreDifference;

  const sourceCountDifference =
    right.signal.sourceCount - left.signal.sourceCount;
  if (sourceCountDifference !== 0) return sourceCountDifference;

  const leftPublishedAt = left.item.publishedAt?.getTime();
  const rightPublishedAt = right.item.publishedAt?.getTime();

  if (leftPublishedAt !== rightPublishedAt) {
    if (leftPublishedAt === undefined) return 1;
    if (rightPublishedAt === undefined) return -1;

    return rightPublishedAt - leftPublishedAt;
  }

  if (left.item.id === right.item.id) return 0;

  return left.item.id < right.item.id ? -1 : 1;
};

export interface RelevanceService {
  rank(
    items: readonly RadarContent[],
    enrichedIds: ReadonlySet<string>,
    now: Date,
    interestSlugs?: ReadonlySet<string>,
  ): RelevanceRanking;
}

@Injectable()
class RelevanceServiceProvider implements RelevanceService {
  rank(
    items: readonly RadarContent[],
    enrichedIds: ReadonlySet<string>,
    now: Date,
    interestSlugs?: ReadonlySet<string>,
  ): RelevanceRanking {
    const sourceCounts = getSourceCountByItemId(items);
    const candidates = items.map((item): RelevanceCandidate => {
      const sourceCount = sourceCounts.get(item.id) ?? 1;
      const score = calculateRelevanceScore({
        authority: calculateAuthorityScore(item.source.name),
        coverage: calculateCoverageScore(sourceCount),
        enrichment: calculateEnrichmentScore(item.id, enrichedIds),
        interest:
          interestSlugs === undefined
            ? 0
            : calculateInterestScore(item, interestSlugs),
        recency: calculateRecencyScore(item.publishedAt, item.collectedAt, now),
      });

      return {
        item,
        signal: { score, sourceCount },
      };
    });
    const signals = new Map(
      candidates.map(({ item, signal }) => [item.id, signal]),
    );
    const featured = candidates.sort(compareRelevanceCandidates)[0];

    return {
      featuredId: featured?.item.id ?? null,
      signals,
    };
  }
}

export const RelevanceService = RelevanceServiceProvider;
