import { ApiProperty } from '@nestjs/swagger';

export class PageMeta {
  @ApiProperty({
    example: 1,
    minimum: 1,
  })
  page!: number;

  @ApiProperty({
    example: 20,
    maximum: 100,
    minimum: 1,
  })
  limit!: number;

  @ApiProperty({
    example: 45,
    minimum: 0,
  })
  total!: number;

  @ApiProperty({
    example: 3,
    minimum: 0,
  })
  totalPages!: number;
}

export class PaginatedResponse<T> {
  @ApiProperty({
    isArray: true,
    type: Object,
  })
  data!: T[];

  @ApiProperty({
    type: PageMeta,
  })
  meta!: PageMeta;
}

export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): PaginatedResponse<T> => ({
  data,
  meta: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  },
});
