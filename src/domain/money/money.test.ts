import { describe, expect, it } from 'vitest';
import {
  addMoney,
  formatMoney,
  money,
  parseMajorToMinor,
  sumMoney,
  zeroMoney,
} from './money';

describe('parseMajorToMinor', () => {
  it('parses whole pesos', () => {
    expect(parseMajorToMinor('2340', 'PHP').amountMinor).toBe(234000);
  });

  it('parses two decimal places', () => {
    expect(parseMajorToMinor('2340.50', 'PHP').amountMinor).toBe(234050);
  });

  it('pads a single decimal place', () => {
    expect(parseMajorToMinor('2340.5', 'PHP').amountMinor).toBe(234050);
  });

  it('handles zero-exponent currencies', () => {
    expect(parseMajorToMinor('1200', 'JPY').amountMinor).toBe(1200);
  });

  it('strips grouping separators', () => {
    expect(parseMajorToMinor('2,340.50', 'PHP').amountMinor).toBe(234050);
  });

  it('rejects more precision than the currency allows', () => {
    expect(() => parseMajorToMinor('10.999', 'PHP')).toThrow(/precision/i);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseMajorToMinor('abc', 'PHP')).toThrow(/invalid/i);
  });

  it('sums exactly in minor units', () => {
    const a = parseMajorToMinor('0.10', 'PHP');
    const b = parseMajorToMinor('0.20', 'PHP');
    expect(addMoney(a, b).amountMinor).toBe(30);
    expect(formatMoney(addMoney(a, b))).toBe('₱0.30');
  });

  it('rejects trailing garbage that parseFloat would silently accept', () => {
    // parseFloat('12abc') returns 12. A typo must never become a silent amount.
    expect(Number.parseFloat('12abc')).toBe(12);
    expect(() => parseMajorToMinor('12abc', 'PHP')).toThrow(/invalid/i);
  });

  it('rejects scientific notation that parseFloat would silently accept', () => {
    // parseFloat('1e3') returns 1000 — a 1000x error from one stray character.
    expect(Number.parseFloat('1e3')).toBe(1000);
    expect(() => parseMajorToMinor('1e3', 'PHP')).toThrow(/invalid/i);
  });

  it('rejects a bare decimal point', () => {
    expect(() => parseMajorToMinor('.', 'PHP')).toThrow(/invalid/i);
  });
});

describe('addMoney', () => {
  it('adds same-currency amounts', () => {
    expect(addMoney(money(100, 'PHP'), money(250, 'PHP')).amountMinor).toBe(350);
  });

  it('throws on currency mismatch', () => {
    expect(() => addMoney(money(100, 'PHP'), money(100, 'USD'))).toThrow(/currency/i);
  });
});

describe('sumMoney', () => {
  it('returns zero for an empty list', () => {
    expect(sumMoney([], 'PHP')).toEqual(zeroMoney('PHP'));
  });

  it('sums a list', () => {
    const items = [money(42000, 'PHP'), money(124000, 'PHP'), money(68000, 'PHP')];
    expect(sumMoney(items, 'PHP').amountMinor).toBe(234000);
  });
});

describe('formatMoney', () => {
  it('formats pesos with grouping', () => {
    expect(formatMoney(money(234000, 'PHP'))).toBe('₱2,340.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(money(-50000, 'PHP'))).toBe('-₱500.00');
  });

  it('formats zero-exponent currencies without decimals', () => {
    expect(formatMoney(money(1200, 'JPY'))).toBe('¥1,200');
  });
});
