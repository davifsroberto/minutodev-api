import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { RadarQueryDto } from './radar-query.dto';

const validateQuery = async (
  query: Record<string, unknown>,
): Promise<{
  dto: RadarQueryDto;
  errors: ValidationError[];
}> => {
  const dto = plainToInstance(RadarQueryDto, query);
  const errors = await validate(dto);

  return { dto, errors };
};

const findError = (errors: ValidationError[], property: keyof RadarQueryDto) =>
  errors.find((error) => error.property === property);

describe('RadarQueryDto', () => {
  it('accepts a valid date and limitPerSection', async () => {
    const { errors } = await validateQuery({
      date: '2026-06-13',
      limitPerSection: 4,
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects dates outside the YYYY-MM-DD format', async () => {
    const { errors } = await validateQuery({ date: '13-06-2026' });

    expect(findError(errors, 'date')?.constraints).toHaveProperty('matches');
  });

  it('rejects limitPerSection values below the minimum', async () => {
    const { errors } = await validateQuery({ limitPerSection: 0 });

    expect(findError(errors, 'limitPerSection')?.constraints).toHaveProperty(
      'min',
    );
  });

  it('rejects limitPerSection values above the maximum', async () => {
    const { errors } = await validateQuery({ limitPerSection: 21 });

    expect(findError(errors, 'limitPerSection')?.constraints).toHaveProperty(
      'max',
    );
  });

  it('rejects non-integer limitPerSection values', async () => {
    const { errors } = await validateQuery({ limitPerSection: 2.5 });

    expect(findError(errors, 'limitPerSection')?.constraints).toHaveProperty(
      'isInt',
    );
  });

  it('applies the default limitPerSection when fields are omitted', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toHaveLength(0);
    expect(dto.limitPerSection).toBe(4);
  });
});
