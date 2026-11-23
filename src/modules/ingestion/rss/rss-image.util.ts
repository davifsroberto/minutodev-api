import { RssItem } from './rss-parser.service';

/**
 * Resolve a imagem **por artigo** de um item de RSS, na prioridade:
 * `enclosure` (imagem) → `media:content` → `media:thumbnail` → 1ª `<img>` útil do
 * `content:encoded` → 1ª `<img>` útil do `content`/`summary`.
 *
 * Mudança (Sprint imagem-2): **não** usamos mais a imagem do *canal* do feed
 * (a `<image>` do RSS) como fallback — ela é a mesma para todos os posts (um
 * banner genérico da marca, ex.: Alura, Medium), então servia de "capa" errada.
 * Quando nada por-artigo é encontrado, retornamos `null`: o chamador tenta o
 * `og:image` da página e, se também falhar, cai na capa gerada a partir do
 * título. Também pulamos `<img>` de tracking/pixel (ex.: `medium.com/_/stat`),
 * que não servem de capa.
 *
 * Pura e reutilizável: usada na ingestão e no backfill (que reaplica a regra
 * sobre o `rawData` já persistido — daí lermos tanto `contentEncoded` quanto a
 * chave crua `content:encoded`, conforme a versão que gravou o item).
 */
export function resolveRssImageUrl(item: RssItem): string | null {
  return (
    imageFromEnclosure(item.enclosure) ??
    imageFromMedia(item.mediaContent) ??
    imageFromMedia(item.mediaThumbnail) ??
    imageFromHtml(item.contentEncoded) ??
    imageFromHtml(item['content:encoded']) ??
    imageFromHtml(item.content) ??
    imageFromHtml(item.summary)
  );
}

function imageFromEnclosure(enclosure: unknown): string | null {
  if (!enclosure || typeof enclosure !== 'object') return null;

  const { url, type } = enclosure as { url?: unknown; type?: unknown };
  const cleaned = cleanImageUrl(url);
  if (!cleaned || isJunkImage(cleaned)) return null;

  const mime = typeof type === 'string' ? type : '';
  // aceita quando o type indica imagem ou, sem type, quando a URL parece imagem
  if (mime.startsWith('image/') || (!mime && looksLikeImage(cleaned))) {
    return cleaned;
  }

  return null;
}

function imageFromMedia(node: unknown): string | null {
  const list = Array.isArray(node) ? node : node ? [node] : [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;

    // rss-parser expõe os atributos do XML sob a chave `$` (xml2js).
    const attrs = (entry as { $?: unknown }).$;
    if (!attrs || typeof attrs !== 'object') continue;

    const { url, medium, type } = attrs as {
      url?: unknown;
      medium?: unknown;
      type?: unknown;
    };
    const cleaned = cleanImageUrl(url);
    if (!cleaned || isJunkImage(cleaned)) continue;

    const isImage =
      medium === 'image' ||
      (typeof type === 'string' && type.startsWith('image/')) ||
      looksLikeImage(cleaned);

    if (isImage) return cleaned;
  }

  return null;
}

/**
 * Primeira `<img>` **útil** do HTML: ignora pixels de tracking e badges (ex.: o
 * `medium.com/_/stat` que a Medium injeta em todo post), que não servem de capa.
 */
function imageFromHtml(html: unknown): string | null {
  if (typeof html !== 'string') return null;

  const re = /<img\b[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const cleaned = cleanImageUrl(match[1]);
    if (cleaned && !isJunkImage(cleaned)) return cleaned;
  }

  return null;
}

function cleanImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  // só http(s): evita data: URIs gigantes e protocolos inesperados
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/** Pixels de tracking, spacers e badges que não servem de capa. */
function isJunkImage(url: string): boolean {
  // `medium.com/_/stat?event=...` e pixels afins (spacer/blank/1x1). Não
  // filtramos por extensão (`.gif`) para não descartar um GIF de capa legítimo.
  return /\/_\/stat\b|[?&]event=|\/(pixel|spacer|blank|1x1)[./?]/i.test(url);
}

function looksLikeImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}
