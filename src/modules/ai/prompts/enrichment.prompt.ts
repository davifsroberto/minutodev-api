import {
  EnrichContentInput,
  EnrichContentOutput,
} from '../providers/llm-provider.interface';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Instruções do editor técnico do minutoDev. Define a política editorial
 * (pt-BR, conteúdo original, sem republicar a fonte) e o formato de saída
 * (JSON estrito) que todo provedor de IA deve seguir.
 */
export const ENRICHMENT_SYSTEM_PROMPT = `Você é o editor técnico do minutoDev, um briefing diário de tecnologia para desenvolvedores.

Sua tarefa é transformar um item de conteúdo técnico (em geral em inglês) em um resumo curto, original e em português do Brasil, próprio para leitura rápida.

Regras obrigatórias:
- Responda SEMPRE em português do Brasil.
- NÃO copie o artigo completo e NÃO reproduza trechos extensos da fonte.
- Produza uma versão condensada e original, escrita com suas próprias palavras (não é uma tradução literal).
- Escreva para desenvolvedores: foco técnico, tom direto e sem linguagem de marketing.
- Explique por que o conteúdo importa para quem desenvolve software.
- Seja conciso: o objetivo é leitura em poucos minutos.

Formato da resposta:
- Responda EXCLUSIVAMENTE com um único objeto JSON válido, sem texto antes ou depois e sem blocos de código (não use crases).
- Use exatamente estas chaves (todas obrigatórias):
{
  "translatedTitle": "título reescrito em pt-BR",
  "shortSummary": "1 a 2 frases resumindo o conteúdo",
  "whyItMatters": "por que isso importa para desenvolvedores",
  "keyPoints": ["2 a 5 pontos principais, cada um curto"],
  "briefContent": "parágrafo curto e original para leitura rápida"
}`;

export function buildEnrichmentUserPrompt(input: EnrichContentInput): string {
  const summaryLine = input.summary?.trim()
    ? `Resumo/descrição da fonte: ${input.summary.trim()}`
    : 'Resumo/descrição da fonte: (não fornecido)';

  const lines: string[] = [
    `Título original: ${input.title}`,
    input.sourceName?.trim() ? `Fonte: ${input.sourceName.trim()}` : null,
    `URL: ${input.url}`,
    summaryLine,
    '',
    `Gere o briefing em ${input.language} seguindo as regras acima e responda apenas com o JSON.`,
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}

export function buildEnrichmentMessages(
  input: EnrichContentInput,
): ChatMessage[] {
  return [
    { role: 'system', content: ENRICHMENT_SYSTEM_PROMPT },
    { role: 'user', content: buildEnrichmentUserPrompt(input) },
  ];
}

/**
 * Converte a resposta textual do modelo no contrato `EnrichContentOutput`.
 *
 * Tolera blocos de código (```json ... ```) por robustez, mas exige que o
 * conteúdo seja um JSON com todos os campos esperados — caso contrário lança
 * um erro claro, sem nunca aceitar uma saída parcial.
 */
export function parseEnrichmentResponse(raw: string): EnrichContentOutput {
  const cleaned = stripCodeFences(raw).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Resposta da IA não é um JSON válido.');
  }

  if (!isEnrichContentOutput(parsed)) {
    throw new Error(
      'Resposta da IA não segue o formato de enriquecimento esperado.',
    );
  }

  return {
    translatedTitle: parsed.translatedTitle,
    shortSummary: parsed.shortSummary,
    whyItMatters: parsed.whyItMatters,
    keyPoints: parsed.keyPoints,
    briefContent: parsed.briefContent,
  };
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  return fenced ? fenced[1] : text;
}

function isEnrichContentOutput(value: unknown): value is EnrichContentOutput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.translatedTitle === 'string' &&
    typeof candidate.shortSummary === 'string' &&
    typeof candidate.whyItMatters === 'string' &&
    typeof candidate.briefContent === 'string' &&
    Array.isArray(candidate.keyPoints) &&
    candidate.keyPoints.every((point) => typeof point === 'string')
  );
}
