/**
 * Extração pura da imagem Open Graph a partir do HTML de uma página.
 *
 * Sem rede e sem DOM: regex sobre as `<meta>`. Prioriza `og:image` (e variantes)
 * sobre `twitter:image`. A resolução de URL relativa contra a base, as
 * requisições de rede e as validações de segurança ficam no
 * `OpenGraphImageService` — aqui é só parsing, fácil de testar.
 */

const META_TAG = /<meta\b[^>]*>/gi;

// Ordem de preferência das chaves `property`/`name`.
const IMAGE_META_KEYS = [
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
];

export function extractOgImageUrl(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) return null;

  const tags = html.match(META_TAG);
  if (!tags) return null;

  const found = new Map<string, string>();

  for (const tag of tags) {
    const key = (
      readAttr(tag, 'property') ?? readAttr(tag, 'name')
    )?.toLowerCase();
    if (!key || found.has(key) || !IMAGE_META_KEYS.includes(key)) continue;

    const content = readAttr(tag, 'content');
    const value = content ? decodeEntities(content).trim() : '';
    if (value) found.set(key, value);
  }

  for (const key of IMAGE_META_KEYS) {
    const value = found.get(key);
    if (value) return value;
  }

  return null;
}

/** Lê um atributo de uma tag, tolerando aspas simples/duplas ou sem aspas. */
function readAttr(tag: string, name: string): string | null {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  );
  const match = tag.match(re);
  if (!match) return null;

  return match[2] ?? match[3] ?? match[4] ?? null;
}

/** Decodifica as entidades HTML comuns que aparecem em URLs (`&amp;` etc.). */
function decodeEntities(value: string): string {
  return (
    value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(parseInt(dec, 10)))
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      // `&amp;` por último para não desfazer entidades já decodificadas acima.
      .replace(/&amp;/gi, '&')
  );
}

function fromCodePoint(code: number): string {
  return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
}
