import { describe, expect, it } from 'vitest';
import { shiftMonth, trailingMonths } from './period';

describe('shiftMonth', () => {
  it('steps forward and back within a year', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
  });

  it('crosses the year boundary in both directions', () => {
    // The stepper is the only way to reach last December, so an off-by-one
    // here silently hides a month of history.
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('steps a whole year', () => {
    expect(shiftMonth('2026-08', -12)).toBe('2025-08');
    expect(shiftMonth('2026-08', 12)).toBe('2027-08');
  });

  it('zero-pads single-digit months', () => {
    // Month keys are compared as strings against substr(occurred_on, 1, 7),
    // so '2026-9' would match nothing at all.
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-02', -1)).toBe('2026-01');
  });

  it('rejects a malformed month key', () => {
    expect(() => shiftMonth('2026-8', 1)).toThrow(/YYYY-MM/);
    expect(() => shiftMonth('not-a-month', 1)).toThrow(/YYYY-MM/);
  });
});

describe('trailingMonths', () => {
  it('returns the window oldest first, ending on the given month', () => {
    expect(trailingMonths('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('returns exactly the requested count', () => {
    expect(trailingMonths('2026-08', 12)).toHaveLength(12);
    expect(trailingMonths('2026-08', 12)[0]).toBe('2025-09');
    expect(trailingMonths('2026-08', 12)[11]).toBe('2026-08');
  });

  it('returns an empty window for a non-positive count', () => {
    expect(trailingMonths('2026-08', 0)).toEqual([]);
  });
});
