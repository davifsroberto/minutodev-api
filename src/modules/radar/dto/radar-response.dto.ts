import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ContentType } from '@prisma/client';

export const RADAR_SECTION_KEYS = [
  'releases',
  'tools',
  'trends',
  'recommended',
] as const;

export type RadarSectionKey = (typeof RADAR_SECTION_KEYS)[number];

export class RadarViewerStateDto {
  @ApiProperty({
    description: 'True quando o usuário já abriu o conteúdo (há histórico).',
    example: true,
  })
  opened!: boolean;

  @ApiProperty({
    description: 'True quando o usuário marcou o conteúdo como lido.',
    example: false,
  })
  read!: boolean;
}

export class RadarItemDto {
  @ApiProperty({
    example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
  })
  id!: string;

  @ApiProperty({
    example: 'TypeScript 5.7 released',
  })
  title!: string;

  @ApiProperty({
    example: 'The latest TypeScript release includes compiler improvements.',
    nullable: true,
    type: String,
  })
  summary!: string | null;

  @ApiProperty({
    example:
      'https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/',
  })
  url!: string;

  @ApiProperty({
    example: 'TypeScript Blog',
  })
  sourceName!: string;

  @ApiProperty({
    example: 3,
    minimum: 1,
    type: Number,
  })
  sourceCount!: number;

  @ApiProperty({
    description:
      'Imagem de capa do conteúdo (RSS ou og:image). Nula quando indisponível — o cliente cai no placeholder.',
    example: 'https://devblogs.microsoft.com/typescript/cover.png',
    nullable: true,
    type: String,
  })
  imageUrl!: string | null;

  @ApiProperty({
    example: 'engineering',
    nullable: true,
    type: String,
  })
  category!: string | null;

  @ApiProperty({
    enum: ContentType,
    enumName: 'ContentType',
    example: ContentType.RELEASE,
  })
  contentType!: ContentType;

  @ApiProperty({
    example: '2026-06-13T09:12:00.000Z',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  publishedAt!: Date | null;

  @ApiPropertyOptional({
    description:
      'Estado de leitura do usuário autenticado. Presente apenas no /radar/for-you; ausente no /radar/today e para anônimos.',
    type: RadarViewerStateDto,
  })
  viewerState?: RadarViewerStateDto;
}

export class RadarSectionDto {
  @ApiProperty({
    enum: RADAR_SECTION_KEYS,
    example: 'releases',
  })
  key!: RadarSectionKey;

  @ApiProperty({
    isArray: true,
    type: RadarItemDto,
  })
  items!: RadarItemDto[];
}

export class RadarResponseDto {
  @ApiProperty({
    example: '2026-06-13',
  })
  date!: string;

  @ApiProperty({
    example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
    nullable: true,
    type: String,
  })
  featuredId!: string | null;

  @ApiProperty({
    isArray: true,
    type: RadarSectionDto,
  })
  sections!: RadarSectionDto[];

  @ApiProperty({
    example: 6,
    maximum: 15,
    minimum: 0,
  })
  estimatedReadTimeMinutes!: number;
}

export class RadarForYouResponseDto extends RadarResponseDto {
  @ApiProperty({
    description:
      'True when the ranking was boosted by the user interests. The raw score is never exposed.',
    example: true,
  })
  personalized!: boolean;

  @ApiProperty({
    description:
      'True when the briefing degraded to the general ranking (no interests configured or failure loading them).',
    example: false,
  })
  personalizationFallback!: boolean;
}
