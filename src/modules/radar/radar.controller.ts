import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RadarQueryDto } from './dto/radar-query.dto';
import { RadarResponseDto } from './dto/radar-response.dto';
import { RadarService } from './radar.service';

const errorEnvelopeSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 400 },
    error: { type: 'string', example: 'BAD_REQUEST' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: ['date must match /^\\d{4}-\\d{2}-\\d{2}$/ regular expression'],
    },
    path: { type: 'string', example: '/radar/today' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-06-13T12:00:00.000Z',
    },
  },
};

@ApiTags('radar')
@Controller('radar')
export class RadarController {
  constructor(private readonly radarService: RadarService) {}

  @Get('today')
  @ApiOperation({ summary: "Get today's themed radar briefing" })
  @ApiOkResponse({
    description: 'Themed daily radar briefing.',
    type: RadarResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid radar query.',
    schema: errorEnvelopeSchema,
  })
  async getToday(@Query() query: RadarQueryDto): Promise<RadarResponseDto> {
    return this.radarService.getToday(query);
  }
}
