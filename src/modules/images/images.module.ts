import { Module } from '@nestjs/common';

import { OpenGraphImageService } from './open-graph.service';

/**
 * Resolução de imagens externas (og:image) usada como fallback quando o RSS não
 * traz imagem. Isolada em um módulo próprio para ser reusada pelo enrichment
 * sob demanda e pelo backfill, sem acoplar a busca de rede ao restante.
 */
@Module({
  providers: [OpenGraphImageService],
  exports: [OpenGraphImageService],
})
export class ImagesModule {}
