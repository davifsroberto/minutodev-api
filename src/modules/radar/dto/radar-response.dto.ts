import { ApiProperty } from '@nestjs/swagger';

import { ContentType } from '@prisma/client';

export const RADAR_SECTION_KEYS = [
  'releases',
  'tools',
  'trends',
  'recommended',
] as const;

export type RadarSectionKey = (typeof RADAR_SECTION_KEYS)[number];

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
