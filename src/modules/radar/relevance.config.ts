export const SOURCE_AUTHORITY_WEIGHTS: Record<string, number> = {
  Alura: 0.6,
  'Angular Blog': 0.9,
  DeepMind: 0.9,
  'Dev.to': 0.55,
  'GitHub Trending RSS': 0.7,
  'Hacker News': 0.7,
  'Hugging Face': 0.8,
  InfoQ: 0.8,
  OpenAI: 0.95,
  TabNews: 0.6,
};

export const DEFAULT_AUTHORITY_WEIGHT = 0.5;

export const RECENCY_WEIGHT = 0.35;
export const AUTHORITY_WEIGHT = 0.25;
export const COVERAGE_WEIGHT = 0.25;
export const ENRICHMENT_WEIGHT = 0.15;

// Boost aditivo do radar personalizado, fora da soma editorial (que fecha em
// 1.0): conteúdo nos interesses do usuário sobe sem nunca esconder os demais.
// Calibrado abaixo do peso máximo de recência — um conteúdo fresco e forte
// fora dos interesses ainda pode vencer um antigo dentro deles.
export const INTEREST_WEIGHT = 0.3;

// Penalidade subtrativa para conteúdo já LIDO no radar personalizado (Sprint
// 13C): reduz levemente a prioridade sem esconder nada. Mantida ABAIXO de
// INTEREST_WEIGHT de propósito — assim ler um conteúdo de interesse nunca o
// rebaixa abaixo de conteúdos fora do interesse. Só se aplica ao for-you.
export const READ_PENALTY = 0.15;

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
