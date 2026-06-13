import { ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class RadarQueryDto {
  @ApiPropertyOptional({
    description: 'UTC day to build the radar for, in YYYY-MM-DD format.',
    example: '2026-06-13',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({
    default: 4,
    description: 'Maximum number of items returned in each radar section.',
    maximum: 20,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limitPerSection: number = 4;
}
