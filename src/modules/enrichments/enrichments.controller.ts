import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ContentEnrichment } from '@prisma/client';

import { EnrichmentResponseDto } from './dto/enrichment-response.dto';
import { EnrichmentsService } from './enrichments.service';

const errorEnvelopeSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 404 },
    error: { type: 'string', example: 'NOT_FOUND' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: 'Content not found',
    },
    path: { type: 'string', example: '/contents/content-id/enrichment' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-06-14T12:00:00.000Z',
    },
  },
};

@ApiTags('contents')
@Controller('contents')
export class EnrichmentsController {
  constructor(private readonly enrichmentsService: EnrichmentsService) {}

  @Get(':id/enrichment')
  @ApiOperation({
    summary: 'Get (or generate on demand) the pt-BR enrichment of a content',
  })
  @ApiOkResponse({
    description:
      'pt-BR enrichment. When no COMPLETED enrichment exists, it is generated on demand via the configured AI provider and persisted as COMPLETED. A concurrent generation in progress returns PROCESSING; an AI failure returns the record as FAILED with a friendly errorMessage and the content-based fallback still populated.',
    type: EnrichmentResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Content item was not found.',
    schema: errorEnvelopeSchema,
  })
  async getEnrichment(@Param('id') id: string): Promise<ContentEnrichment> {
    return this.enrichmentsService.getOrCreateForContent(id);
  }
}
