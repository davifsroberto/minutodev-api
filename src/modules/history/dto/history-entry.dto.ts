import { ApiProperty } from '@nestjs/swagger';

import { UserContentHistory } from '@prisma/client';

export const HISTORY_STATUSES = ['READ', 'OPENED'] as const;

export type HistoryStatus = (typeof HISTORY_STATUSES)[number];

/** Estado do registro de histórico após registrar abertura ou leitura. */
export class HistoryEntryDto {
  @ApiProperty({
    example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
  })
  contentId!: string;

  @ApiProperty({
    example: '2026-07-03T12:00:00.000Z',
    format: 'date-time',
    type: String,
  })
  firstOpenedAt!: Date;

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
    example: 2,
    minimum: 1,
  })
  openCount!: number;

  @ApiProperty({
    enum: HISTORY_STATUSES,
    example: 'OPENED',
  })
  status!: HistoryStatus;

  static from(entry: UserContentHistory): HistoryEntryDto {
    return {
      contentId: entry.contentId,
      firstOpenedAt: entry.firstOpenedAt,
      lastOpenedAt: entry.lastOpenedAt,
      readAt: entry.readAt,
      openCount: entry.openCount,
      status: entry.readAt ? 'READ' : 'OPENED',
    };
  }
}
