import { RssItem } from './rss-parser.service';

/**
 * Resolve a imagem de um item de RSS na prioridade aprovada (Sprint 5D-1):
 * `enclosure` (imagem) → `media:content` → `media:thumbnail` → 1ª `<img>` do
 * corpo → imagem do canal do feed. Sem Open Graph (não fazer scraping). Retorna
 * `null` quando não há nada — o frontend usa um placeholder padrão.
 *
 * Pura e reutilizável: usada tanto na ingestão quanto no backfill (que reaplica
 * a regra sobre o `rawData` já persistido).
 */
export function resolveRssImageUrl(
  item: RssItem,
  feedImageUrl?: string | null,
): string | null {
  return (
    imageFromEnclosure(item.enclosure) ??
    imageFromMedia(item.mediaContent) ??
    imageFromMedia(item.mediaThumbnail) ??
    imageFromHtml(item.content) ??
    imageFromHtml(item.summary) ??
    cleanImageUrl(feedImageUrl)
  );
}

function imageFromEnclosure(enclosure: unknown): string | null {
  if (!enclosure || typeof enclosure !== 'object') return null;

  const { url, type } = enclosure as { url?: unknown; type?: unknown };
  const cleaned = cleanImageUrl(url);
  if (!cleaned) return null;

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
    if (!cleaned) continue;

    const isImage =
      medium === 'image' ||
      (typeof type === 'string' && type.startsWith('image/')) ||
      looksLikeImage(cleaned);

    if (isImage) return cleaned;
  }

  return null;
}

function imageFromHtml(html: unknown): string | null {
  if (typeof html !== 'string') return null;

  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? cleanImageUrl(match[1]) : null;
}

function cleanImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  // só http(s): evita data: URIs gigantes e protocolos inesperados
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function looksLikeImage(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url);
}
