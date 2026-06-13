import { ApiPropertyOptional } from '@nestjs/swagger';

import { ContentStatus } from '@prisma/client';

import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListContentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Content category to filter by.',
    example: 'backend',
    type: String,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Source id to filter by.',
    example: '9b7a1d8f-0e81-4f1a-b630-897fa7d40353',
    type: String,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: 'Content lifecycle status to filter by.',
    enum: ContentStatus,
    enumName: 'ContentStatus',
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
