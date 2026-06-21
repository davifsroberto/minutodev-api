import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InterestsResponseDto } from './dto/interests-response.dto';
import { TopicDto } from './dto/topic.dto';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { InterestsService } from './interests.service';

const errorEnvelopeSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number', example: 400 },
    error: { type: 'string', example: 'BAD_REQUEST' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      example: ['Temas de interesse desconhecidos: foo'],
    },
    path: { type: 'string', example: '/me/interests' },
    timestamp: {
      type: 'string',
      format: 'date-time',
      example: '2026-06-20T12:00:00.000Z',
    },
  },
};

@ApiTags('interests')
@Controller()
@UseGuards(JwtAuthGuard)
export class InterestsController {
  constructor(private readonly interestsService: InterestsService) {}

  @Get('interests/catalog')
  @ApiOperation({
    summary: 'Lista o catálogo de temas de interesse disponíveis.',
  })
  @ApiOkResponse({
    description: 'Catálogo de temas.',
    type: TopicDto,
    isArray: true,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async catalog(): Promise<TopicDto[]> {
    const topics = await this.interestsService.listCatalog();

    return topics.map((topic) => TopicDto.from(topic));
  }

  @Get('me/interests')
  @ApiOperation({ summary: 'Retorna os interesses do usuário autenticado.' })
  @ApiOkResponse({
    description: 'Interesses atuais.',
    type: InterestsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async getMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InterestsResponseDto> {
    return InterestsResponseDto.from(
      await this.interestsService.getForUser(user.id),
    );
  }

  @Put('me/interests')
  @ApiOperation({ summary: 'Atualiza (substitui) os interesses do usuário.' })
  @ApiOkResponse({
    description: 'Interesses atualizados.',
    type: InterestsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payload inválido ou tema desconhecido.',
    schema: errorEnvelopeSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  async updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateInterestsDto,
  ): Promise<InterestsResponseDto> {
    return InterestsResponseDto.from(
      await this.interestsService.replaceForUser(user.id, dto.interests),
    );
  }
}
