export const SUMMARY_MAX_LENGTH = 280;

/**
 * Reduz um texto (que pode vir com HTML, como o `content`/`summary` de um RSS)
 * a um teaser de exibição: remove tags, colapsa espaços e trunca na última
 * palavra inteira dentro de `maxLength`, com reticências. O conteúdo completo
 * deve ser preservado à parte (ex.: `Content.rawSummary`).
 *
 * Retorna `null` quando não sobra texto — assim a coluna fica nula em vez de
 * guardar uma string vazia.
 */
export const summarizeContent = (
  raw: string | null | undefined,
  maxLength: number = SUMMARY_MAX_LENGTH,
): string | null => {
  if (!raw) return null;

  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();

  return `${trimmed}…`;
};
