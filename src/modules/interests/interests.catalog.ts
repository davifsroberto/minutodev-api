/**
 * Catálogo canônico de temas de interesse — a fonte ÚNICA da taxonomia
 * editorial, compartilhada pelo seed do banco e (via API) pelo frontend.
 *
 * Os `slug` seguem o vocabulário em inglês/minúsculo do projeto; cinco já
 * existem em `Source.category` (`ai`, `frontend`, `engineering`, `community`,
 * `opensource`) e os demais são a taxonomia-alvo, a ser coberta por conteúdo
 * conforme novas fontes entram (o casamento conteúdo↔interesse é da Sprint 12).
 * O `label` em pt-BR é só o rótulo de exibição. Não criar taxonomia paralela:
 * em runtime a validação é feita contra a tabela `Topic` (semeada a partir
 * desta lista), nunca contra um segundo vocabulário.
 */
export type TopicSeed = {
  slug: string;
  label: string;
};

export const INTEREST_TOPICS = [
  { slug: 'ai', label: 'IA' },
  { slug: 'frontend', label: 'Frontend' },
  { slug: 'backend', label: 'Backend' },
  { slug: 'engineering', label: 'Engenharia' },
  { slug: 'community', label: 'Comunidade' },
  { slug: 'opensource', label: 'Open Source' },
  { slug: 'cloud', label: 'Cloud' },
  { slug: 'security', label: 'Segurança' },
  { slug: 'devops', label: 'DevOps' },
  { slug: 'mobile', label: 'Mobile' },
  { slug: 'architecture', label: 'Arquitetura' },
  { slug: 'database', label: 'Banco de Dados' },
  { slug: 'career', label: 'Carreira' },
] as const satisfies ReadonlyArray<TopicSeed>;

export const INTEREST_TOPIC_SLUGS: ReadonlyArray<string> = INTEREST_TOPICS.map(
  (topic) => topic.slug,
);
