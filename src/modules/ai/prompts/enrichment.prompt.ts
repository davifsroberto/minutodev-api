import {
  EnrichContentInput,
  EnrichContentOutput,
} from '../providers/llm-provider.interface';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** Limite de caracteres do texto da fonte enviado à IA (controle de custo/tokens). */
export const SOURCE_CONTENT_MAX_CHARS = 6000;

/**
 * Instruções do editor técnico do minutoDev. Define a política editorial
 * (pt-BR natural, conteúdo original, sem republicar a fonte) e o formato de
 * saída (JSON estrito) que todo provedor de IA deve seguir.
 *
 * O objetivo é um BRIEFING editorial — fatos concretos, exemplos e aprendizados
 * reais —, não um resumo automático genérico. O leitor deve entender a maior
 * parte do conteúdo sem abrir a fonte original.
 */
export const ENRICHMENT_SYSTEM_PROMPT = `Você é o editor técnico do minutoDev, uma newsletter diária de tecnologia para desenvolvedores. Você transforma um artigo técnico (em geral em inglês) em um briefing curado, original e em português do Brasil, para leitura rápida.

Objetivo: o leitor deve entender a MAIOR PARTE do conteúdo sem abrir a fonte. Escreva como um editor que leu o artigo e explica o que importa — não como um tradutor.

Qualidade editorial (obrigatório):
- Extraia FATOS CONCRETOS do artigo: números, versões, nomes de APIs/comandos, benchmarks, decisões técnicas. Evite frases vagas como "traz melhorias" ou "é importante" sem dizer o quê.
- Quando o artigo citar um exemplo concreto (um comando, um trecho de configuração, um caso de uso, um número), destaque-o.
- Aponte aprendizados reais e, quando fizer sentido, quando vale (ou não) a pena usar/adotar algo (trade-offs).
- Sem repetição entre os campos e sem encher linguiça. Cada campo agrega informação nova.

Política e tom (obrigatório):
- Responda SEMPRE em português do Brasil, com texto natural e fluido — NÃO faça tradução literal. Preserve termos técnicos consagrados em inglês (ex.: build, deploy, runtime, pull request) quando a versão em português soar artificial.
- Conteúdo ORIGINAL, escrito com suas próprias palavras. NÃO copie o artigo completo nem reproduza trechos extensos da fonte.
- Foco técnico e direto, para desenvolvedores. Sem linguagem de marketing.

Formato da resposta:
- Responda EXCLUSIVAMENTE com um único objeto JSON válido, sem texto antes ou depois e sem blocos de código (não use crases).
- Use exatamente estas chaves (todas presentes):
{
  "translatedTitle": "título reescrito em pt-BR, claro e específico",
  "shortSummary": "o que é, em 1 a 2 frases concretas",
  "whyItMatters": "por que isso importa para quem desenvolve software",
  "keyPoints": ["3 a 6 aprendizados concretos, cada um curto e específico"],
  "example": "um exemplo concreto citado no artigo (comando, número, caso) — ou null se o artigo não trouxer nenhum",
  "whenToUse": "quando vale a pena usar/adotar e principais trade-offs — ou null se o artigo não deixar claro",
  "briefContent": "2 a 4 parágrafos curtos e originais que permitam entender o conteúdo sem abrir a fonte"
}
- "example" e "whenToUse" devem ser null (valor JSON null, não a string "null") quando a informação não existir no artigo. NUNCA invente exemplos ou recomendações que não estejam na fonte.`;

export function buildEnrichmentUserPrompt(input: EnrichContentInput): string {
  const summaryLine = input.summary?.trim()
    ? `Resumo/descrição da fonte: ${input.summary.trim()}`
    : 'Resumo/descrição da fonte: (não fornecido)';

  const sourceContent = prepareSourceContent(input.sourceContent);

  const lines: string[] = [
    `Título original: ${input.title}`,
    input.sourceName?.trim() ? `Fonte: ${input.sourceName.trim()}` : null,
    `URL: ${input.url}`,
    summaryLine,
    sourceContent
      ? `\nTexto da fonte (use como matéria-prima; não copie literalmente):\n"""\n${sourceContent}\n"""`
      : null,
    '',
    `Gere o briefing em ${input.language} seguindo as regras acima e responda apenas com o JSON.`,
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}

/**
 * Prepara o texto da fonte para o prompt: remove HTML, colapsa espaços e limita
 * o tamanho. Mantém o prompt enxuto e previsível em custo, sem perder o miolo.
 */
function prepareSourceContent(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= SOURCE_CONTENT_MAX_CHARS) return text;

  return `${text.slice(0, SOURCE_CONTENT_MAX_CHARS).trimEnd()}…`;
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
    example: normalizeOptional(parsed.example),
    whenToUse: normalizeOptional(parsed.whenToUse),
    briefContent: parsed.briefContent,
  };
}

/**
 * Normaliza um campo opcional do modelo: aceita string, mas converte ausência,
 * `null` e a string literal "null"/"" (que alguns modelos devolvem) em `null`.
 */
function normalizeOptional(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;

  return trimmed;
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
