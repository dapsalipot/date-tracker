import { describe, expect, it } from 'vitest';
import { nextAmount } from './amountInput';
import { parseMajorToMinor } from '@/domain/money/money';

const PHP = 2;
const JPY = 0;

describe('nextAmount', () => {
  it('appends digits', () => {
    expect(nextAmount('42', '0', PHP)).toBe('420');
  });

  it('deletes the last character', () => {
    expect(nextAmount('420', '⌫', PHP)).toBe('42');
  });

  it('deleting an empty value stays empty', () => {
    expect(nextAmount('', '⌫', PHP)).toBe('');
  });

  it('leads a bare decimal point with a zero', () => {
    // "." alone is not parseable money: parseMajorToMinor requires a digit and
    // throws without one. A screen that parses on every render — Settings does,
    // to disable Save on zero — crashes on that keystroke rather than showing
    // a bad number.
    expect(nextAmount('', '.', PHP)).toBe('0.');
  });

  it('never emits a value parseMajorToMinor rejects', () => {
    // The real contract. Every reachable keystroke sequence has to survive a
    // parse, since that is what both callers do with the result.
    // Deliberately deletes back to empty before pressing '.', which is the
    // only sequence that produced an unparseable value. A run that never
    // empties the field passes without touching the bug.
    const keys = ['1', '⌫', '.', '5', '0', '.', '9', '⌫', '⌫', '⌫', '⌫', '.'] as const;
    let value = '';
    for (const key of keys) {
      value = nextAmount(value, key, PHP);
      if (value !== '') expect(() => parseMajorToMinor(value, 'PHP')).not.toThrow();
    }
  });

  it('allows only one decimal point', () => {
    expect(nextAmount('4.2', '.', PHP)).toBe('4.2');
  });

  it('caps the fraction at the currency exponent', () => {
    expect(nextAmount('4.20', '5', PHP)).toBe('4.20');
  });

  it('refuses a decimal point for a currency with no minor unit', () => {
    expect(nextAmount('420', '.', JPY)).toBe('420');
  });

  it('caps the integer part', () => {
    expect(nextAmount('9999999', '9', PHP)).toBe('9999999');
    expect(nextAmount('999999', '9', PHP)).toBe('9999999');
  });
});
