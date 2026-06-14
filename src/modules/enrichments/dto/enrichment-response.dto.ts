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
    description:
      'Principais aprendizados concretos. Vazio enquanto não enriquecido.',
    example: [],
    isArray: true,
    type: String,
  })
  keyPoints!: string[];

  @ApiProperty({
    description:
      'Exemplo concreto citado no artigo (comando, número, caso). Nulo quando não há.',
    example: 'tsc --noEmit ficou ~20% mais rápido em monorepos.',
    nullable: true,
    type: String,
  })
  example!: string | null;

  @ApiProperty({
    description:
      'Quando vale a pena usar/adotar e trade-offs. Nulo quando o artigo não deixa claro.',
    nullable: true,
    type: String,
  })
  whenToUse!: string | null;

  @ApiProperty({
    description: 'Conteúdo detalhado em pt-BR para leitura sem abrir a fonte.',
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
      'Imagem do artigo (RSS/feed) para o hero. Nula quando indisponível (o front usa um placeholder).',
    example: 'https://devblogs.microsoft.com/typescript/cover.png',
    nullable: true,
    type: String,
  })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Nome da fonte do conteúdo (para o hero).',
    example: 'TypeScript Blog',
  })
  sourceName!: string;

  @ApiProperty({
    description: 'Data de publicação do conteúdo original (para o hero).',
    example: '2026-06-13T09:12:00.000Z',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  publishedAt!: Date | null;

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
