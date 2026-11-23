import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ContentsService } from '../contents/contents.service';
import { buildCoverSvg } from './cover-image.util';

/**
 * Capa gerada (SVG) a partir do título do conteúdo, para quando não há imagem
 * real do post. Servida como `image/svg+xml` e cacheável — o frontend usa esta
 * URL como fallback de `imageUrl` na thumb/hero.
 *
 * Nunca 404: um id inexistente ainda devolve uma capa genérica do minutoDev,
 * para não quebrar a `<img>`.
 */
@ApiTags('contents')
@Controller('contents')
export class CoverController {
  constructor(private readonly contents: ContentsService) {}

  @Get(':id/cover.svg')
  @ApiOperation({
    summary: 'Branded SVG cover generated from the content title',
  })
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  async getCover(@Param('id') id: string): Promise<string> {
    const content = await this.contents.findById(id);

    return buildCoverSvg({
      title: content?.title ?? 'minutoDev',
      sourceName: content?.source?.name ?? null,
    });
  }
}
