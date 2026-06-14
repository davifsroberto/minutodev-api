/**
 * Contrato genérico de provedor de IA (LLM) do minutoDev.
 *
 * As regras de negócio dependem apenas desta interface — nunca de um provedor
 * concreto —, o que permite trocar DeepSeek/OpenAI/Claude/Gemini/Ollama sem
 * tocar no restante do sistema.
 */

/** Idiomas suportados na geração de conteúdo. Hoje, apenas pt-BR. */
export type SupportedLanguage = 'pt-BR';

export interface EnrichContentInput {
  title: string;
  /** Teaser curto da fonte (exibição). */
  summary?: string | null;
  /**
   * Texto mais completo da fonte (descrição/conteúdo do RSS), quando disponível.
   * É a principal matéria-prima do briefing — sem ele a IA só tem o teaser e o
   * resultado fica superficial. O chamador deve limitar o tamanho (custo/tokens).
   */
  sourceContent?: string | null;
  url: string;
  sourceName?: string;
  language: SupportedLanguage;
}

export interface EnrichContentOutput {
  translatedTitle: string;
  shortSummary: string;
  whyItMatters: string;
  keyPoints: string[];
  /** Exemplo concreto citado no artigo (comando, número, caso). Nulo se não houver. */
  example: string | null;
  /** Quando vale a pena usar / trade-offs. Nulo se o artigo não deixar claro. */
  whenToUse: string | null;
  briefContent: string;
}

export interface LlmProvider {
  enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput>;
}
