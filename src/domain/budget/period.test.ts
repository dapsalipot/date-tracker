import { describe, expect, it } from 'vitest';
import { daysRemainingIn, periodMonthFor } from './period';

describe('periodMonthFor', () => {
  it('extracts the year-month', () => {
    expect(periodMonthFor('2026-08-03')).toBe('2026-08');
  });

  it('handles december', () => {
    expect(periodMonthFor('2026-12-31')).toBe('2026-12');
  });

  it('rejects malformed dates', () => {
    expect(() => periodMonthFor('03-08-2026')).toThrow(/iso date/i);
  });
});

describe('daysRemainingIn', () => {
  it('counts days left including today', () => {
    expect(daysRemainingIn('2026-08', '2026-08-30')).toBe(2);
  });

  it('returns 1 on the last day', () => {
    expect(daysRemainingIn('2026-08', '2026-08-31')).toBe(1);
  });

  it('handles february in a leap year', () => {
    expect(daysRemainingIn('2028-02', '2028-02-28')).toBe(2);
  });

  it('returns 0 when today is outside the period', () => {
    expect(daysRemainingIn('2026-08', '2026-09-01')).toBe(0);
  });
});
