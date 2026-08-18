import { describe, expect, it } from 'vitest';
import { toRows, type TextFragment } from './rows';

const frag = (text: string, top: number, left: number, height = 20): TextFragment => ({
  text,
  top,
  left,
  height,
});

describe('toRows', () => {
  it('joins fragments that sit on the same visual row', () => {
    // The whole reason this exists: ML Kit reports a receipt's label column and
    // amount column as separate blocks, so "LATTE" and "180.00" arrive apart.
    const rows = toRows([frag('LATTE', 100, 10), frag('180.00', 102, 260)]);

    expect(rows).toEqual(['LATTE 180.00']);
  });

  it('orders a row left to right, not in the order OCR reported it', () => {
    const rows = toRows([frag('180.00', 100, 260), frag('LATTE', 100, 10)]);

    expect(rows).toEqual(['LATTE 180.00']);
  });

  it('orders rows top to bottom', () => {
    const rows = toRows([frag('CARBONARA', 200, 10), frag('LATTE', 100, 10)]);

    expect(rows).toEqual(['LATTE', 'CARBONARA']);
  });

  it('keeps separate rows apart', () => {
    const rows = toRows([
      frag('LATTE', 100, 10),
      frag('180.00', 100, 260),
      frag('CARBONARA', 140, 10),
      frag('420.00', 140, 260),
    ]);

    expect(rows).toEqual(['LATTE 180.00', 'CARBONARA 420.00']);
  });

  it('tolerates the small vertical drift of a photographed receipt', () => {
    // A receipt is never photographed perfectly square, so a row's fragments
    // differ by a few pixels. Demanding an exact match would split every row.
    const rows = toRows([frag('SET DINNER', 100, 10), frag('1,240.50', 107, 260)]);

    expect(rows).toEqual(['SET DINNER 1,240.50']);
  });

  it('does not merge two rows that are genuinely adjacent', () => {
    // Drift tolerance must stay under one line's height, or a tight receipt
    // collapses into a single row and every amount is lost.
    const rows = toRows([frag('LATTE', 100, 10, 20), frag('CARBONARA', 122, 10, 20)]);

    expect(rows).toEqual(['LATTE', 'CARBONARA']);
  });

  it('bounds how tall one row can grow', () => {
    // Each fragment sits 11px below the one before — inside a 20px line's
    // tolerance, so each is close enough to its predecessor to join. Measured
    // that way the row walks down the page and swallows the whole receipt.
    // Measuring against the row's first fragment instead caps a row at the
    // tolerance however many fragments drift past, so this splits.
    const rows = toRows([
      frag('LATTE', 100, 10),
      frag('MOCHA', 111, 10),
      frag('CARBONARA', 122, 10),
      frag('TIRAMISU', 133, 10),
    ]);

    expect(rows.length).toBeGreaterThan(1);
  });

  it('scales its tolerance to the text size', () => {
    // Same 22px gap as above, but the text is twice the size, so these two
    // fragments are within one line of each other and belong to one row.
    const rows = toRows([frag('SET', 100, 10, 60), frag('DINNER', 122, 90, 60)]);

    expect(rows).toEqual(['SET DINNER']);
  });

  it('ignores fragments with no text', () => {
    const rows = toRows([frag('  ', 100, 10), frag('LATTE', 140, 10)]);

    expect(rows).toEqual(['LATTE']);
  });

  it('returns nothing for no fragments', () => {
    expect(toRows([])).toEqual([]);
  });
});
