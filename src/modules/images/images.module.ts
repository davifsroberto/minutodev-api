import { Module } from '@nestjs/common';

import { ContentsModule } from '../contents/contents.module';
import { CoverController } from './cover.controller';
import { OpenGraphImageService } from './open-graph.service';

/**
 * Resolução de imagens externas (og:image) usada como fallback quando o RSS não
 * traz imagem. Isolada em um módulo próprio para ser reusada pelo enrichment
 * sob demanda e pelo backfill, sem acoplar a busca de rede ao restante.
 *
 * Também expõe a capa gerada (`CoverController`) a partir do título, usada
 * quando não há imagem real do post.
 */
@Module({
  imports: [ContentsModule],
  controllers: [CoverController],
  providers: [OpenGraphImageService],
  exports: [OpenGraphImageService],
})
export class ImagesModule {}
