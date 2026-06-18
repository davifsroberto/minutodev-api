export const SOURCE_AUTHORITY_WEIGHTS: Record<string, number> = {
  'Angular Blog': 0.9,
  'Dev.to': 0.55,
  'GitHub Trending RSS': 0.7,
  'Hacker News Newest': 0.65,
  InfoQ: 0.8,
  OpenAI: 0.95,
};

export const DEFAULT_AUTHORITY_WEIGHT = 0.5;

export const RECENCY_WEIGHT = 0.35;
export const AUTHORITY_WEIGHT = 0.25;
export const COVERAGE_WEIGHT = 0.25;
export const ENRICHMENT_WEIGHT = 0.15;

export const RECENCY_HALF_LIFE_HOURS = 24;
export const JACCARD_SIMILARITY_THRESHOLD = 0.4;
export const COVERAGE_SATURATION = 3;

export const TITLE_STOPWORDS: readonly string[] = [
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'for',
  'from',
  'in',
  'is',
  'na',
  'nas',
  'no',
  'nos',
  'of',
  'on',
  'or',
  'ou',
  'para',
  'por',
  'the',
  'to',
  'um',
  'uma',
  'with',
];

// Evoluir para Source.authorityWeight se os ajustes passarem a exigir operação sem deploy.
