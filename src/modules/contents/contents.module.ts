import { Module } from '@nestjs/common';

import { ContentsService } from './contents.service';

/**
 * Módulo responsável pelos conteúdos coletados.
 *
 * Exporta o `ContentsService` para consumo por módulos futuros (ex.: radar,
 * crawlers de RSS/GitHub) sem reimplementar o acesso aos conteúdos.
 */
@Module({
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
