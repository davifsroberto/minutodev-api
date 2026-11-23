import { Injectable } from '@nestjs/common';

import { ContentStatus, ContentType, Prisma, Source } from '@prisma/client';

import { summarizeContent } from '../../../common/utils/summarize-content.util';
import { resolveRssImageUrl } from './rss-image.util';
import { RssItem } from './rss-parser.service';

/**
 * Converte itens de RSS no payload de criação de `Content`.
 *
 * Mantém o mapeamento em um único lugar, sem acesso a banco — o que torna a
 * normalização pura e fácil de testar.
 */
@Injectable()
export class RssNormalizerService {
  /**
   * Normaliza um item de RSS para `Content`.
   *
   * Retorna `null` quando o item não possui URL (`link`/`guid`): sem ela não
   * há como deduplicar nem persistir o conteúdo.
   */
  normalize(
    item: RssItem,
    source: Source,
  ): Prisma.ContentUncheckedCreateInput | null {
    const url = item.link ?? item.guid;
    if (!url) return null;

    // `rawSummary` preserva a descrição original completa; `summary` é só um
    // teaser truncado para exibição (o `contentSnippet` do RSS vem com o artigo
    // inteiro, sem corte — daí o `summarizeContent`).
    const rawSummary = item.content ?? item.summary ?? null;
    const summary = summarizeContent(
      item.contentSnippet ?? item.content ?? item.summary,
    );

    return {
      sourceId: source.id,
      title: item.title ?? url,
      url,
      summary,
      author: item.creator ?? item.author ?? null,
      publishedAt: this.toDate(item.isoDate ?? item.pubDate),
      collectedAt: new Date(),
      category: source.category,
      tags: [],
      contentType: ContentType.ARTICLE,
      imageUrl: resolveRssImageUrl(item),
      rawTitle: item.title ?? null,
      rawSummary,
      rawData: this.toJson(item),
      score: 0,
      status: ContentStatus.NEW,
    };
  }

  private toDate(value?: string | null): Date | null {
    if (!value) return null;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toJson(item: RssItem): Prisma.InputJsonValue {
    // Round-trip por JSON remove `undefined`/referências circulares antes de
    // gravar na coluna `Json`.
    return JSON.parse(JSON.stringify(item)) as Prisma.InputJsonValue;
  }
}
