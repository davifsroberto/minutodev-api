import {
  JACCARD_SIMILARITY_THRESHOLD,
  TITLE_STOPWORDS,
} from './relevance.config';
import {
  calculateJaccardSimilarity,
  getSourceCountByItemId,
  groupTopics,
  normalizeTitle,
  TopicGroupingItem,
} from './topic-grouping.util';

const item = (
  id: string,
  title: string,
  sourceId: string = `source-${id}`,
): TopicGroupingItem => ({
  id,
  sourceId,
  title,
});

describe('topic grouping util', () => {
  describe('normalizeTitle', () => {
    it('normalizes case, accents and punctuation into the same token set', () => {
      expect(normalizeTitle('Node.js 22 lançado!')).toEqual(
        normalizeTitle('node js 22 lancado'),
      );
    });

    it('removes Portuguese and English stopwords from titles', () => {
      expect(
        normalizeTitle('A evolução de the Node.js', TITLE_STOPWORDS),
      ).toEqual(new Set(['evolucao', 'node', 'js']));
    });
  });

  describe('calculateJaccardSimilarity', () => {
    it('places representative same-topic and distinct-topic pairs around the configured threshold', () => {
      const sameTopic = calculateJaccardSimilarity(
        normalizeTitle('Node.js 22 lançado'),
        normalizeTitle('Lançado Node.js 22 com novidades'),
      );
      const distinctTopic = calculateJaccardSimilarity(
        normalizeTitle('Node.js 22 lançado'),
        normalizeTitle('PostgreSQL melhora replicação lógica'),
      );

      expect(sameTopic).toBeGreaterThanOrEqual(JACCARD_SIMILARITY_THRESHOLD);
      expect(distinctTopic).toBeLessThan(JACCARD_SIMILARITY_THRESHOLD);
    });

    it('returns zero when both token sets are empty', () => {
      expect(
        calculateJaccardSimilarity(normalizeTitle('the a'), new Set()),
      ).toBe(0);
    });
  });

  describe('groupTopics', () => {
    it('applies single-linkage transitively', () => {
      const groups = groupTopics([
        item('a', 'alpha beta gamma'),
        item('b', 'alpha beta gamma delta epsilon'),
        item('c', 'gamma delta epsilon'),
      ]);

      expect(groups).toHaveLength(1);
      expect(groups[0].items.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    });

    it('counts repeated source ids once within a group', () => {
      const groups = groupTopics([
        item('a', 'Node.js 22 lançado', 'source-1'),
        item('b', 'Lançado Node.js 22', 'source-1'),
      ]);

      expect(groups).toHaveLength(1);
      expect(groups[0].sourceCount).toBe(1);
    });

    it('keeps an unmatched item in a singleton group with one source', () => {
      const groups = groupTopics([
        item('node', 'Node.js 22 lançado'),
        item('postgres', 'PostgreSQL melhora replicação lógica'),
      ]);

      expect(groups).toHaveLength(2);
      expect(groups.map(({ sourceCount }) => sourceCount)).toEqual([1, 1]);
    });

    it('returns stable groups for the same input', () => {
      const items = [
        item('a', 'Node.js 22 lançado', 'source-1'),
        item('b', 'Lançado Node.js 22', 'source-2'),
        item('c', 'PostgreSQL melhora replicação lógica', 'source-3'),
      ];
      const groupIds = () =>
        groupTopics(items).map((group) => group.items.map(({ id }) => id));

      expect(groupIds()).toEqual(groupIds());
    });
  });

  describe('getSourceCountByItemId', () => {
    it('maps every item to the distinct source count of its group', () => {
      const sourceCounts = getSourceCountByItemId([
        item('a', 'Node.js 22 lançado', 'source-1'),
        item('b', 'Lançado Node.js 22', 'source-1'),
        item('c', 'Node.js 22 é lançado', 'source-2'),
        item('d', 'PostgreSQL melhora replicação lógica', 'source-3'),
      ]);

      expect(Object.fromEntries(sourceCounts)).toEqual({
        a: 2,
        b: 2,
        c: 2,
        d: 1,
      });
    });
  });
});
