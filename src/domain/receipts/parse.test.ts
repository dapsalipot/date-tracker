import { describe, expect, it } from 'vitest';
import { parseReceipt } from './parse';

const PHP = 'PHP';

describe('parseReceipt', () => {
  it('reads a line item written as name then amount', () => {
    const result = parseReceipt(['LATTE           180.00'], PHP);

    expect(result.items).toEqual([{ label: 'LATTE', amountMinor: 18000 }]);
  });

  it('reads several items and keeps their order', () => {
    const result = parseReceipt(
      ['BAG OF BEANS', 'LATTE        180.00', 'CARBONARA    420.00'],
      PHP,
    );

    expect(result.items.map((i) => i.label)).toEqual(['LATTE', 'CARBONARA']);
    expect(result.items.map((i) => i.amountMinor)).toEqual([18000, 42000]);
  });

  it('ignores a line with no amount', () => {
    // A shop name, an address, a "thank you" — most of a receipt is not an item.
    const result = parseReceipt(['BAG OF BEANS TAGAYTAY', 'LATTE 180.00'], PHP);

    expect(result.items).toHaveLength(1);
  });

  it('ignores a line with no label', () => {
    const result = parseReceipt(['180.00', 'LATTE 180.00'], PHP);

    expect(result.items).toHaveLength(1);
  });

  it('takes the total from a line naming it, not from the largest number', () => {
    const result = parseReceipt(
      ['LATTE      180.00', 'CARBONARA  420.00', 'TOTAL      600.00'],
      PHP,
    );

    expect(result.totalMinor).toBe(60000);
    // The total is not itself an item — adding it would double the bill.
    expect(result.items.map((i) => i.label)).toEqual(['LATTE', 'CARBONARA']);
  });

  it('recognises the common total spellings', () => {
    for (const word of ['TOTAL', 'Total', 'AMOUNT DUE', 'Grand Total', 'TOTAL DUE']) {
      const result = parseReceipt([`LATTE 180.00`, `${word} 180.00`], PHP);
      expect(result.totalMinor).toBe(18000);
    }
  });

  it('excludes subtotal, tax, change and cash lines from the items', () => {
    const result = parseReceipt(
      [
        'LATTE       180.00',
        'SUBTOTAL    180.00',
        'VAT         21.60',
        'CASH        500.00',
        'CHANGE      320.00',
        'TOTAL       180.00',
      ],
      PHP,
    );

    expect(result.items.map((i) => i.label)).toEqual(['LATTE']);
    expect(result.totalMinor).toBe(18000);
  });

  it('reports no total when the receipt never names one', () => {
    const result = parseReceipt(['LATTE 180.00'], PHP);

    // Guessing the largest number would call a ₱500 cash tender the total.
    expect(result.totalMinor).toBeNull();
  });

  it('handles thousands separators and a currency symbol', () => {
    const result = parseReceipt(['SET DINNER   ₱1,240.50'], PHP);

    expect(result.items[0]?.amountMinor).toBe(124050);
  });

  it('reads a whole-peso amount with no decimals', () => {
    const result = parseReceipt(['JEEP 15'], PHP);

    expect(result.items[0]?.amountMinor).toBe(1500);
  });

  it('respects a zero-exponent currency', () => {
    // ¥1240 is 1240 minor units, not 124000 — the exponent is 0.
    const result = parseReceipt(['RAMEN 1240'], 'JPY');

    expect(result.items[0]?.amountMinor).toBe(1240);
  });

  it('ignores a quantity prefix rather than reading it as the price', () => {
    const result = parseReceipt(['2 x LATTE      360.00'], PHP);

    expect(result.items).toEqual([{ label: '2 x LATTE', amountMinor: 36000 }]);
  });

  it('returns nothing for text with no amounts at all', () => {
    const result = parseReceipt(['THANK YOU', 'PLEASE COME AGAIN'], PHP);

    expect(result.items).toEqual([]);
    expect(result.totalMinor).toBeNull();
  });

  it('ignores an amount that is obviously not money', () => {
    // Receipt footers are full of long digit runs — invoice numbers, TINs,
    // phone numbers — and reading one as an item invents a huge expense.
    const result = parseReceipt(['TIN 123456789012', 'LATTE 180.00'], PHP);

    expect(result.items.map((i) => i.label)).toEqual(['LATTE']);
  });
});
