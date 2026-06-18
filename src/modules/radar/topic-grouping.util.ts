import {
  JACCARD_SIMILARITY_THRESHOLD,
  TITLE_STOPWORDS,
} from './relevance.config';

export interface TopicGroupingItem {
  id: string;
  sourceId: string;
  title: string;
}

export interface TopicGroup<T extends TopicGroupingItem = TopicGroupingItem> {
  items: readonly T[];
  sourceCount: number;
}

export const normalizeTitle = (
  title: string,
  stopwords: readonly string[] = TITLE_STOPWORDS,
): ReadonlySet<string> => {
  const normalizedStopwords = new Set(stopwords);
  const tokens = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !normalizedStopwords.has(token));

  return new Set(tokens);
};

export const calculateJaccardSimilarity = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number => {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;

  let intersectionSize = 0;

  for (const token of left) {
    if (right.has(token)) intersectionSize += 1;
  }

  return intersectionSize / union.size;
};

export const countDistinctSources = (
  items: readonly TopicGroupingItem[],
): number => new Set(items.map((item) => item.sourceId)).size;

export const groupTopics = <T extends TopicGroupingItem>(
  items: readonly T[],
  threshold: number = JACCARD_SIMILARITY_THRESHOLD,
  stopwords: readonly string[] = TITLE_STOPWORDS,
): readonly TopicGroup<T>[] => {
  const parents = items.map((_, index) => index);
  const tokenSets = items.map((item) => normalizeTitle(item.title, stopwords));

  const find = (index: number): number => {
    let root = index;

    while (parents[root] !== root) {
      root = parents[root];
    }

    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }

    return root;
  };

  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);

    if (leftRoot === rightRoot) return;

    const root = Math.min(leftRoot, rightRoot);
    parents[leftRoot] = root;
    parents[rightRoot] = root;
  };

  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const similarity = calculateJaccardSimilarity(
        tokenSets[left],
        tokenSets[right],
      );

      if (similarity >= threshold) union(left, right);
    }
  }

  const groupedItems = new Map<number, T[]>();

  items.forEach((item, index) => {
    const root = find(index);
    const group = groupedItems.get(root);

    if (group) {
      group.push(item);
      return;
    }

    groupedItems.set(root, [item]);
  });

  return [...groupedItems.values()].map((groupItems) => ({
    items: groupItems,
    sourceCount: countDistinctSources(groupItems),
  }));
};

export const getSourceCountByItemId = <T extends TopicGroupingItem>(
  items: readonly T[],
  threshold: number = JACCARD_SIMILARITY_THRESHOLD,
  stopwords: readonly string[] = TITLE_STOPWORDS,
): ReadonlyMap<string, number> => {
  const sourceCounts = new Map<string, number>();

  for (const group of groupTopics(items, threshold, stopwords)) {
    for (const item of group.items) {
      sourceCounts.set(item.id, group.sourceCount);
    }
  }

  return sourceCounts;
};
