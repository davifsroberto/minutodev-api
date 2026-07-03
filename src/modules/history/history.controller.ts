import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HistoryEntryDto } from './dto/history-entry.dto';
import { HistoryItemDto } from './dto/history-item.dto';
import { HistoryService } from './history.service';

const errorEnvelopeSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 404 },
    error: { type: 'string', example: 'NOT_FOUND' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: 'Content not found',
    },
    path: { type: 'string', example: '/me/history/contents/content-id/open' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-07-03T12:00:00.000Z',
    },
  },
};

@ApiTags('history')
@Controller('me/history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // POST idempotente (cria ou atualiza o mesmo registro), por isso 200 e não 201.
  @Post('contents/:contentId/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra a abertura de um conteúdo pelo usuário.' })
  @ApiOkResponse({
    description: 'Registro de histórico criado ou atualizado.',
    type: HistoryEntryDto,
  })
  @ApiNotFoundResponse({
    description: 'Conteúdo inexistente.',
    schema: errorEnvelopeSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async registerOpen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contentId') contentId: string,
  ): Promise<HistoryEntryDto> {
    return HistoryEntryDto.from(
      await this.historyService.registerOpen(user.id, contentId),
    );
  }

  @Post('contents/:contentId/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marca um conteúdo como lido pelo usuário.' })
  @ApiOkResponse({
    description: 'Registro de histórico com leitura concluída.',
    type: HistoryEntryDto,
  })
  @ApiNotFoundResponse({
    description: 'Conteúdo inexistente.',
    schema: errorEnvelopeSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('contentId') contentId: string,
  ): Promise<HistoryEntryDto> {
    return HistoryEntryDto.from(
      await this.historyService.markAsRead(user.id, contentId),
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Lista o histórico de leitura do usuário autenticado.',
  })
  @ApiOkResponse({
    description: 'Histórico paginado, ordenado por último acesso.',
    type: PaginatedResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<HistoryItemDto>> {
    const { limit, page } = query;
    const { data, total } = await this.historyService.listForUser(
      user.id,
      page,
      limit,
    );

    return createPaginatedResponse(data, page, limit, total);
  }
}
