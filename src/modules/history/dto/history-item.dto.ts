import { ApiProperty } from '@nestjs/swagger';

import { Content, Source, UserContentHistory } from '@prisma/client';

import { ContentTranslation } from '../../contents/contents.service';
import type { HistoryStatus } from './history-entry.dto';
import { HISTORY_STATUSES } from './history-entry.dto';

export type HistoryEntryWithContent = UserContentHistory & {
  content: Content & { source: Source };
};

/** Item do GET /me/history com os dados de exibição do conteúdo. */
export class HistoryItemDto {
  @ApiProperty({
    example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
  })
  contentId!: string;

  @ApiProperty({
    description: 'Título traduzido (pt-BR) quando disponível; original senão.',
    example: 'TypeScript 5.7 lançado',
  })
  title!: string;

  @ApiProperty({
    example: 'https://devblogs.microsoft.com/typescript/cover.png',
    nullable: true,
    type: String,
  })
  imageUrl!: string | null;

  @ApiProperty({
    example: 'TypeScript Blog',
  })
  sourceName!: string;

  @ApiProperty({
    example: '2026-06-13T09:12:00.000Z',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  publishedAt!: Date | null;

  @ApiProperty({
    example: '2026-07-03T15:30:00.000Z',
    format: 'date-time',
    type: String,
  })
  lastOpenedAt!: Date;

  @ApiProperty({
    example: '2026-07-03T15:35:00.000Z',
    format: 'date-time',
    nullable: true,
    type: String,
  })
  readAt!: Date | null;

  @ApiProperty({
    enum: HISTORY_STATUSES,
    example: 'READ',
  })
  status!: HistoryStatus;

  static from(
    entry: HistoryEntryWithContent,
    translation?: ContentTranslation,
  ): HistoryItemDto {
    return {
      contentId: entry.contentId,
      title: translation?.translatedTitle ?? entry.content.title,
      imageUrl: entry.content.imageUrl,
      sourceName: entry.content.source.name,
      publishedAt: entry.content.publishedAt,
      lastOpenedAt: entry.lastOpenedAt,
      readAt: entry.readAt,
      status: entry.readAt ? 'READ' : 'OPENED',
    };
  }
}
