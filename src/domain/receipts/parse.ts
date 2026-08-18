import { minorExponent } from '@/domain/money/money';

export interface ReceiptItem {
  readonly label: string;
  readonly amountMinor: number;
}

export interface ParsedReceipt {
  readonly items: readonly ReceiptItem[];
  /** Null when the receipt never names a total — guessing invents one. */
  readonly totalMinor: number | null;
}

/**
 * Turns the raw text lines an OCR engine returns into candidate line items.
 *
 * This is deliberately conservative. On-device OCR gives text, not
 * understanding, so every rule here is a heuristic that will sometimes be
 * wrong — which is why the caller is expected to present the result as
 * suggestions the user confirms, never as facts written straight to the
 * database.
 *
 * The one thing it refuses to do is guess. A receipt that never says "total"
 * reports no total, because the alternative — taking the largest number — reads
 * a ₱500 cash tender on a ₱180 bill as the amount spent.
 */

/** Lines whose amount is bookkeeping, not something that was bought. */
const NOT_AN_ITEM = /^(sub-?total|vat|tax|cash|change|tender|balance|discount|service charge)\b/i;

/** Lines that name the bill's total. */
const TOTAL_LINE = /\b(grand\s+total|total\s+due|amount\s+due|total)\b/i;

/**
 * A money-looking number at the end of a line: an optional currency symbol,
 * then digits with optional thousands separators and decimals.
 *
 * The symbol class is specific on purpose. A permissive `[^\d\s]` also matches
 * the last letter of the label, so "LATTE 180.00" parses as "LATT".
 */
const TRAILING_AMOUNT = /(?:[₱$€¥₩]\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*$/;

/**
 * Receipt footers carry invoice numbers, TINs and phone numbers. Reading one as
 * money invents an enormous expense, so a long unbroken digit run is rejected.
 */
const MAX_PLAIN_DIGITS = 7;

function toMinor(raw: string, currencyCode: string): number | null {
  const cleaned = raw.replace(/,/g, '');
  if (!cleaned.includes('.') && cleaned.replace(/\D/g, '').length > MAX_PLAIN_DIGITS) {
    return null;
  }

  const exponent = minorExponent(currencyCode);
  const [whole = '', fraction = ''] = cleaned.split('.');

  if (exponent === 0) {
    // A zero-exponent currency has no sub-unit: ¥1240 is 1240 minor units.
    // A decimal here is OCR noise, so the whole part is the amount.
    const value = Number.parseInt(whole, 10);
    return Number.isFinite(value) ? value : null;
  }

  const padded = fraction.padEnd(exponent, '0').slice(0, exponent);
  const value = Number.parseInt(`${whole}${padded}`, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseReceipt(lines: readonly string[], currencyCode: string): ParsedReceipt {
  const items: ReceiptItem[] = [];
  let totalMinor: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const match = TRAILING_AMOUNT.exec(trimmed);
    if (match?.[1] === undefined) continue;

    const amountMinor = toMinor(match[1], currencyCode);
    if (amountMinor === null) continue;

    const label = trimmed.slice(0, match.index).trim().replace(/[.:\s]+$/, '');
    if (label === '') continue;

    if (TOTAL_LINE.test(label)) {
      totalMinor = amountMinor;
      continue;
    }

    if (NOT_AN_ITEM.test(label)) continue;

    items.push({ label, amountMinor });
  }

  return { items, totalMinor };
}
