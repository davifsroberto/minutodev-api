import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { SourcesModule } from '../sources/sources.module';
import { IngestionService } from './ingestion.service';
import { RssNormalizerService } from './rss/rss-normalizer.service';
import { RssParserService } from './rss/rss-parser.service';

/**
 * Módulo de ingestão de conteúdos.
 *
 * Consome `SourcesService`/`ContentsService` (exportados pelos respectivos
 * módulos) e expõe o `IngestionService` para execução manual via CLI e, no
 * futuro, para o módulo radar/agendador.
 */
@Module({
  imports: [SourcesModule, ContentsModule],
  providers: [IngestionService, RssParserService, RssNormalizerService],
  exports: [IngestionService],
})
export class IngestionModule {}
