import { Injectable } from '@nestjs/common';

import Parser from 'rss-parser';

/** Item de feed RSS já parseado (campos conhecidos + extras arbitrários). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RssItem = Parser.Item & { [key: string]: any };

/** Feed RSS parseado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RssFeed = Parser.Output<{ [key: string]: any }>;

/**
 * Wrapper fino sobre a biblioteca `rss-parser`.
 *
 * Isola a dependência externa do restante do módulo, facilitando troca de
 * biblioteca e testes (mock) no futuro.
 */
@Injectable()
export class RssParserService {
  private readonly parser = new Parser({
    timeout: 15_000,
    headers: {
      // Alguns feeds bloqueiam clientes sem User-Agent identificável.
      'User-Agent': 'minutoDev-bot/1.0 (+https://minutodev.com)',
      // Alguns servidores respondem 406 sem um Accept de XML/RSS explícito.
      Accept:
        'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
    },
    customFields: {
      // Mídia não é capturada por padrão; usamos para extrair a imagem do item.
      item: [
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ],
    },
  });

  parseUrl(url: string): Promise<RssFeed> {
    return this.parser.parseURL(url);
  }
}
