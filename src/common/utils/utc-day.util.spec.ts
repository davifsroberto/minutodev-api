import { endOfUtcDay, startOfUtcDay } from './utc-day.util';

describe('utc day helpers', () => {
  const instant = new Date('2026-06-13T14:30:00.000Z');

  it('returns the start of the UTC calendar day', () => {
    expect(startOfUtcDay(instant).toISOString()).toBe(
      '2026-06-13T00:00:00.000Z',
    );
  });

  it('returns the end of the UTC calendar day', () => {
    expect(endOfUtcDay(instant).toISOString()).toBe('2026-06-13T23:59:59.999Z');
  });

  it('is deterministic and does not mutate the input date', () => {
    const date = new Date('2026-06-13T14:30:00.000Z');
    const originalTime = date.getTime();

    expect(startOfUtcDay(date).getTime()).toBe(startOfUtcDay(date).getTime());
    expect(endOfUtcDay(date).getTime()).toBe(endOfUtcDay(date).getTime());
    expect(date.getTime()).toBe(originalTime);
  });
});
