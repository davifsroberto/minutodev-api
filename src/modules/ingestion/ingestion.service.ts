import { Injectable, Logger } from '@nestjs/common';

import { SourceType } from '@prisma/client';

import { ContentsService } from '../contents/contents.service';
import { SourcesService } from '../sources/sources.service';
import { RssNormalizerService } from './rss/rss-normalizer.service';
import { RssParserService } from './rss/rss-parser.service';

/** Resumo agregado de uma execução de ingestão. */
export interface IngestionSummary {
  sourcesProcessed: number;
  itemsFound: number;
  created: number;
  duplicates: number;
  errors: number;
}

/**
 * Orquestra a ingestão de conteúdos a partir de feeds RSS.
 *
 * Resiliência: a falha de uma source (ou de um item) é registrada e
 * contabilizada, mas não interrompe o processamento das demais.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly sources: SourcesService,
    private readonly contents: ContentsService,
    private readonly parser: RssParserService,
    private readonly normalizer: RssNormalizerService,
  ) {}

  async ingestRss(): Promise<IngestionSummary> {
    const summary: IngestionSummary = {
      sourcesProcessed: 0,
      itemsFound: 0,
      created: 0,
      duplicates: 0,
      errors: 0,
    };

    const sources = await this.sources.findEnabledByType(SourceType.RSS);
    this.logger.log(`Iniciando ingestão RSS de ${sources.length} source(s).`);

    for (const source of sources) {
      summary.sourcesProcessed += 1;

      let feedItems;
      let feedImageUrl: string | null = null;
      try {
        const feed = await this.parser.parseUrl(source.url);
        feedItems = feed.items ?? [];
        feedImageUrl = feed.image?.url ?? null;
      } catch (error) {
        summary.errors += 1;
        this.logger.error(
          `Falha ao ler feed "${source.name}" (${source.url}): ${this.describe(error)}`,
        );
        continue;
      }

      summary.itemsFound += feedItems.length;

      for (const item of feedItems) {
        try {
          const data = this.normalizer.normalize(item, source, feedImageUrl);

          if (!data) {
            summary.errors += 1;
            this.logger.warn(`Item sem URL ignorado em "${source.name}".`);
            continue;
          }

          const result = await this.contents.createIfNew(data);

          if (result === 'created') {
            summary.created += 1;
          } else {
            summary.duplicates += 1;
          }
        } catch (error) {
          summary.errors += 1;
          this.logger.warn(
            `Falha ao salvar item de "${source.name}": ${this.describe(error)}`,
          );
        }
      }

      this.logger.log(
        `"${source.name}": ${feedItems.length} item(ns) lido(s).`,
      );
    }

    this.logger.log(
      `Ingestão concluída — fontes: ${summary.sourcesProcessed}, itens: ${summary.itemsFound}, ` +
        `criados: ${summary.created}, duplicados: ${summary.duplicates}, erros: ${summary.errors}.`,
    );

    return summary;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
