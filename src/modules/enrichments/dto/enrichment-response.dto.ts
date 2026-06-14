import { ApiProperty } from '@nestjs/swagger';

import { EnrichmentStatus } from '@prisma/client';

export class EnrichmentResponseDto {
  @ApiProperty({ example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353' })
  id!: string;

  @ApiProperty({ example: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })
  contentId!: string;

  @ApiProperty({ example: 'pt-BR' })
  language!: string;

  @ApiProperty({
    example: 'TypeScript 5.7 lançado',
    nullable: true,
    type: String,
  })
  translatedTitle!: string | null;

  @ApiProperty({
    example: 'A nova versão do TypeScript traz melhorias no compilador.',
    nullable: true,
    type: String,
  })
  shortSummary!: string | null;

  @ApiProperty({
    description: 'Por que o conteúdo importa. Nulo enquanto não enriquecido.',
    nullable: true,
    type: String,
  })
  whyItMatters!: string | null;

  @ApiProperty({
    description: 'Pontos principais. Vazio enquanto não enriquecido.',
    example: [],
    isArray: true,
    type: String,
  })
  keyPoints!: string[];

  @ApiProperty({
    example: 'A nova versão do TypeScript traz melhorias no compilador.',
    nullable: true,
    type: String,
  })
  briefContent!: string | null;

  @ApiProperty({
    example:
      'https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/',
  })
  originalUrl!: string;

  @ApiProperty({
    description:
      'Provedor de IA que gerou o enriquecimento (ex.: mock, gemini). Nulo antes da geração.',
    nullable: true,
    type: String,
  })
  provider!: string | null;

  @ApiProperty({
    description:
      'Modelo de IA solicitado (LLM_MODEL) na geração. Nulo quando não configurado ou antes da geração.',
    nullable: true,
    type: String,
  })
  model!: string | null;

  @ApiProperty({
    enum: EnrichmentStatus,
    enumName: 'EnrichmentStatus',
    description:
      'COMPLETED quando a IA gerou o conteúdo; PROCESSING durante a geração; FAILED quando a IA falhou (com fallback e errorMessage).',
    example: EnrichmentStatus.COMPLETED,
  })
  status!: EnrichmentStatus;

  @ApiProperty({
    description:
      'Mensagem amigável quando status=FAILED; nulo nos demais estados.',
    nullable: true,
    type: String,
  })
  errorMessage!: string | null;

  @ApiProperty({ example: '2026-06-14T09:12:00.000Z', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-06-14T09:12:00.000Z', format: 'date-time' })
  updatedAt!: Date;
}
