import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { PaginationQueryDto } from './pagination-query.dto';

const validateQuery = async (
  query: Record<string, unknown>,
): Promise<{
  dto: PaginationQueryDto;
  errors: ValidationError[];
}> => {
  const dto = plainToInstance(PaginationQueryDto, query);
  const errors = await validate(dto);

  return { dto, errors };
};

const findError = (
  errors: ValidationError[],
  property: keyof PaginationQueryDto,
) => errors.find((error) => error.property === property);

describe('PaginationQueryDto', () => {
  it('applies defaults when page and limit are omitted', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('coerces query strings to numbers', async () => {
    const { dto, errors } = await validateQuery({
      limit: '50',
      page: '2',
    });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(typeof dto.page).toBe('number');
    expect(typeof dto.limit).toBe('number');
  });

  it('rejects limit values above the cap', async () => {
    const { errors } = await validateQuery({ limit: 101 });

    expect(findError(errors, 'limit')?.constraints).toHaveProperty('max');
  });

  it('rejects limit values below the minimum', async () => {
    const { errors } = await validateQuery({ limit: 0 });

    expect(findError(errors, 'limit')?.constraints).toHaveProperty('min');
  });

  it('rejects page values below the minimum', async () => {
    const { errors } = await validateQuery({ page: 0 });

    expect(findError(errors, 'page')?.constraints).toHaveProperty('min');
  });

  it('rejects non-integer page strings after coercion', async () => {
    const { errors } = await validateQuery({ page: 'abc' });

    expect(findError(errors, 'page')?.constraints).toHaveProperty('isInt');
  });
});
