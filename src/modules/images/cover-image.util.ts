import { resolveBrandTheme } from './brand-palette';

export interface CoverInput {
  title: string;
  sourceName: string | null;
}

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 72;

/**
 * Gera uma capa SVG a partir do título do artigo, usada quando não há imagem
 * real do post. Mostra a fonte em destaque no topo e o título em grande,
 * com um gradiente/accent próximos da identidade da marca (ver `brand-palette`).
 *
 * Função pura (sem rede/DOM): recebe título + fonte e devolve a string SVG.
 * Servida como `image/svg+xml`, então todo texto é escapado — não roda script e
 * não referencia imagens externas (que não carregariam via `<img src>`).
 */
export function buildCoverSvg({ title, sourceName }: CoverInput): string {
  const theme = resolveBrandTheme(sourceName);
  const label = (sourceName ?? 'minutoDev').trim() || 'minutoDev';

  const cleanTitle = title.replace(/\s+/g, ' ').trim() || label;
  const { fontSize, lineHeight } = pickTitleScale(cleanTitle.length);
  const maxChars = Math.floor((WIDTH - PADDING * 2) / (fontSize * 0.54));
  const lines = wrapText(cleanTitle, maxChars, 4);

  // Bloco do título ancorado na parte de baixo, acima do rodapé.
  const blockHeight = lines.length * lineHeight;
  const titleTop = HEIGHT - PADDING - 90 - blockHeight;

  const titleTspans = lines
    .map(
      (line, i) =>
        `<tspan x="${PADDING}" y="${titleTop + (i + 1) * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(label)}: ${escapeXml(cleanTitle)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.from}"/>
      <stop offset="1" stop-color="${theme.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.12" r="0.9">
      <stop offset="0" stop-color="${theme.accent}" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="${theme.accent}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.45"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <circle cx="${WIDTH - 140}" cy="140" r="320" fill="${theme.accent}" opacity="0.07"/>
  <circle cx="${WIDTH - 60}" cy="${HEIGHT - 40}" r="200" fill="#ffffff" opacity="0.04"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)"/>

  <g font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
    <circle cx="${PADDING + 7}" cy="${PADDING + 24}" r="7" fill="${theme.accent}"/>
    <text x="${PADDING + 26}" y="${PADDING + 31}" fill="${theme.accent}" font-size="27" font-weight="700" letter-spacing="3">${escapeXml(label.toUpperCase())}</text>

    <text fill="#ffffff" font-size="${fontSize}" font-weight="800" letter-spacing="-0.5">${titleTspans}</text>

    <circle cx="${PADDING + 5}" cy="${HEIGHT - PADDING - 4}" r="5" fill="${theme.accent}"/>
    <text x="${PADDING + 20}" y="${HEIGHT - PADDING}" fill="#ffffff" fill-opacity="0.72" font-size="26" font-weight="700" letter-spacing="0.3">minuto<tspan fill="${theme.accent}" fill-opacity="1">Dev</tspan></text>
  </g>
</svg>`;
}

/** Fonte maior para títulos curtos; menor (e mais linhas) para os longos. */
function pickTitleScale(length: number): {
  fontSize: number;
  lineHeight: number;
} {
  if (length <= 42) return { fontSize: 76, lineHeight: 90 };
  if (length <= 90) return { fontSize: 62, lineHeight: 76 };

  return { fontSize: 52, lineHeight: 64 };
}

/** Quebra o texto em até `maxLines` linhas de ~`maxChars`, com reticências. */
export function wrapText(
  text: string,
  maxChars: number,
  maxLines: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    // palavra isolada maior que a linha: corta no limite
    current = word.length > maxChars ? word.slice(0, maxChars) : word;

    if (lines.length === maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    // Houve corte? Sinaliza com reticências na última linha.
    const joined = lines.join(' ');
    if (joined.length < text.length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length >= maxChars
          ? `${last.slice(0, maxChars - 1)}…`
          : `${last}…`;
    }
  }

  return lines.length ? lines : [text.slice(0, maxChars)];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
