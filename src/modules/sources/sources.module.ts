import { Module } from '@nestjs/common';

import { SourcesService } from './sources.service';

/**
 * Módulo responsável pelas fontes de conteúdo.
 *
 * Exporta o `SourcesService` para que módulos futuros (ex.: radar) possam
 * consumi-lo sem reimplementar o acesso às fontes.
 */
@Module({
  providers: [SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
