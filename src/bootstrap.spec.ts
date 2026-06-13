import { parseCorsOrigins } from './bootstrap';

describe('parseCorsOrigins', () => {
  it('parses a comma-separated list into trimmed origins', () => {
    expect(
      parseCorsOrigins('http://localhost:4500,https://app.example.com'),
    ).toEqual(['http://localhost:4500', 'https://app.example.com']);
  });

  it('trims surrounding whitespace around each origin', () => {
    expect(
      parseCorsOrigins('  http://localhost:4500 ,  https://app.example.com  '),
    ).toEqual(['http://localhost:4500', 'https://app.example.com']);
  });

  it('drops empty entries left by doubled or trailing commas', () => {
    expect(parseCorsOrigins('http://localhost:4500,,')).toEqual([
      'http://localhost:4500',
    ]);
  });

  it('returns an empty allowlist when the value is unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
  });

  it('returns an empty allowlist for empty or whitespace-only input', () => {
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });
});
