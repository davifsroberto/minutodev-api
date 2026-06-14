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
  summary?: string | null;
  url: string;
  sourceName?: string;
  language: SupportedLanguage;
}

export interface EnrichContentOutput {
  translatedTitle: string;
  shortSummary: string;
  whyItMatters: string;
  keyPoints: string[];
  briefContent: string;
}

export interface LlmProvider {
  enrichContent(input: EnrichContentInput): Promise<EnrichContentOutput>;
}
