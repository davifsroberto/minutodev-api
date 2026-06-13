import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Content, Source } from '@prisma/client';

import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ContentsService } from './contents.service';
import { ListContentsQueryDto } from './dto/list-contents-query.dto';

type ContentWithSource = Content & { source: Source };

const errorEnvelopeSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 404 },
    error: { type: 'string', example: 'NOT_FOUND' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: 'Content not found',
    },
    path: { type: 'string', example: '/contents/content-id' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-06-13T12:00:00.000Z',
    },
  },
};

@ApiTags('contents')
@Controller('contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get()
  @ApiOperation({ summary: 'List collected content' })
  @ApiOkResponse({
    description: 'Paginated collected content.',
    type: PaginatedResponse,
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination or filter query.',
    schema: errorEnvelopeSchema,
  })
  async findAll(
    @Query() query: ListContentsQueryDto,
  ): Promise<PaginatedResponse<Content>> {
    const { category, limit, page, source, status } = query;
    const { data, total } = await this.contentsService.findPaginated(
      { category, sourceId: source, status },
      page,
      limit,
    );

    return createPaginatedResponse(data, page, limit, total);
  }

  @Get('today')
  @ApiOperation({ summary: 'List content from the current UTC day' })
  @ApiOkResponse({
    description: 'Paginated content published or collected today.',
    type: PaginatedResponse,
  })
  @ApiBadRequestResponse({
    description: 'Invalid pagination query.',
    schema: errorEnvelopeSchema,
  })
  async findToday(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<Content>> {
    const { limit, page } = query;
    const { data, total } = await this.contentsService.findToday(page, limit);

    return createPaginatedResponse(data, page, limit, total);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one content item by id' })
  @ApiOkResponse({
    description: 'Content item with source details.',
    type: Object,
  })
  @ApiNotFoundResponse({
    description: 'Content item was not found.',
    schema: errorEnvelopeSchema,
  })
  async findById(@Param('id') id: string): Promise<ContentWithSource> {
    const content = await this.contentsService.findById(id);

    if (content === null) throw new NotFoundException('Content not found');

    return content;
  }
}
