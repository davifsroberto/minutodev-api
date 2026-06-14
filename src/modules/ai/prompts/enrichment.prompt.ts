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
export const ENRICHMENT_SYSTEM_PROMPT = `Você é o editor técnico do minutoDev, uma newsletter diária de tecnologia para desenvolvedores. Você transforma um artigo técnico (em geral em inglês) em um briefing curado, original e em português do Brasil.

Objetivo de leitura (escreva pensando nisto):
- Em 10s o leitor entende do que se trata, se é relevante para ele e qual a principal conclusão.
- Em 1min entende o principal aprendizado e, quando o artigo fornecer, um exemplo concreto e quando aplicar.
- Em 3min consome o briefing completo SEM precisar abrir a fonte. A fonte fica só para aprofundamento.

Escreva como um editor que leu o artigo e explica o que importa — não como um tradutor.

Diretrizes editoriais (obrigatório):
- Português do Brasil natural e fluido. NÃO traduza literalmente. Preserve termos técnicos consagrados em inglês (build, deploy, runtime, pull request, etc.) quando a versão traduzida soar artificial.
- Explique conceitos difíceis de forma simples, sem perder a precisão técnica.
- Extraia FATOS CONCRETOS: números, versões, nomes de APIs/comandos, benchmarks, decisões técnicas. Evite frases vagas como "traz melhorias" sem dizer o quê.
- Destaque consequências práticas, decisões técnicas relevantes e aprendizado aplicável.
- Sem repetição entre os campos: cada campo agrega informação nova. Não encha linguiça só para preencher espaço.

Proibido:
- Tradução literal; reproduzir trechos da fonte; copiar o artigo; conteúdo genérico de enchimento.

Formato da resposta:
- Responda EXCLUSIVAMENTE com um único objeto JSON válido, sem texto antes ou depois e sem blocos de código (não use crases).
- Use exatamente estas chaves (todas presentes):
{
  "translatedTitle": "título reescrito em pt-BR, claro e específico",
  "summary30s": "RESUMO EM 30 SEGUNDOS: no máximo 3 frases, extremamente objetivas, respondendo: o que aconteceu? qual a principal conclusão? por que devo me importar?",
  "shortSummary": "O QUE É: 1 a 2 frases concretas",
  "whyItMatters": "POR QUE IMPORTA para quem desenvolve software",
  "keyInsight": "INSIGHT PRINCIPAL: a única ideia para lembrar deste artigo, em 1 a 2 frases (a tese central, não um resumo)",
  "keyPoints": ["PRINCIPAIS APRENDIZADOS: 3 a 6 itens concretos e específicos, cada um curto"],
  "example": "EXEMPLO concreto citado no artigo (comando, número, caso) — ou null se o artigo não trouxer nenhum",
  "whenToUse": "QUANDO VALE A PENA usar/adotar e principais trade-offs — ou null se o artigo não deixar claro",
  "audienceFor": ["PARA QUEM IMPORTA: 2 a 5 perfis técnicos reais que devem ler (ex.: Backend, Segurança, DevOps, Frontend, Mobile, Dados)"],
  "audienceIgnore": ["PODE IGNORAR SE: 0 a 4 perfis para quem é pouco relevante — ou lista vazia se for amplamente relevante"],
  "briefContent": "CONTEÚDO DETALHADO: 2 a 4 parágrafos curtos e originais que permitam entender o conteúdo sem abrir a fonte"
}
- "summary30s", "keyInsight", "example" e "whenToUse" devem ser null (valor JSON null, não a string "null") quando a informação não existir no artigo. NUNCA invente fatos, exemplos ou recomendações que não estejam na fonte.
- "audienceFor"/"audienceIgnore": use perfis técnicos reais e plausíveis a partir do conteúdo; não invente categorias absurdas. Um mesmo perfil NÃO deve aparecer nas duas listas. "audienceIgnore" pode ser uma lista vazia.
- A regra de NÃO inventar SEMPRE prevalece sobre as metas de tamanho/leitura. Em "keyPoints"/"audienceFor", os números ("3 a 6"/"2 a 5") são alvos: se o material não render o mínimo, entregue MENOS itens reais em vez de inventar (mas "keyPoints" nunca deve ficar vazio).
- Quando o "Texto da fonte" NÃO for fornecido (só título + teaser), baseie-se apenas neles: seja mais conciso e honesto e prefira um "briefContent" mais curto a preencher lacunas com suposições. Não force exemplos nem recomendações.`;

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
  const parsed = parseJsonLoose(raw);

  if (parsed === undefined) {
    throw new Error('Resposta da IA não é um JSON válido.');
  }

  if (!isEnrichContentOutput(parsed)) {
    throw new Error(
      'Resposta da IA não segue o formato de enriquecimento esperado.',
    );
  }

  return {
    translatedTitle: parsed.translatedTitle,
    summary30s: normalizeOptional(parsed.summary30s),
    shortSummary: parsed.shortSummary,
    whyItMatters: parsed.whyItMatters,
    keyInsight: normalizeOptional(parsed.keyInsight),
    keyPoints: parsed.keyPoints,
    example: normalizeOptional(parsed.example),
    whenToUse: normalizeOptional(parsed.whenToUse),
    audienceFor: normalizeStringList(parsed.audienceFor),
    audienceIgnore: normalizeStringList(parsed.audienceIgnore),
    briefContent: parsed.briefContent,
  };
}

/**
 * Normaliza uma lista de strings do modelo: aceita um array, descarta itens
 * não-string ou vazios e retorna `[]` para qualquer outra forma (ausente, null).
 */
function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
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

/**
 * Tenta extrair um JSON da resposta do modelo. Primeiro com a cerca de código
 * removida; se falhar, tenta o texto cru. Retorna `undefined` quando nenhuma
 * forma produz JSON válido (em vez de aceitar dado parcial).
 */
function parseJsonLoose(raw: string): unknown {
  for (const candidate of [stripCodeFences(raw).trim(), raw.trim()]) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // tenta o próximo candidato
    }
  }

  return undefined;
}

function stripCodeFences(text: string): string {
  // Só remove a cerca quando a string INTEIRA está cercada (âncoras ^/$), para
  // não truncar em crases triplas que façam parte de um valor do JSON.
  const fenced = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i);

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
