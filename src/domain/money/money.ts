export interface Money {
  readonly amountMinor: number;
  readonly currencyCode: string;
}

const MINOR_EXPONENTS: Readonly<Record<string, number>> = {
  PHP: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KRW: 0,
};

const SYMBOLS: Readonly<Record<string, string>> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  KRW: '₩',
};

export function minorExponent(currencyCode: string): number {
  return MINOR_EXPONENTS[currencyCode] ?? 2;
}

export function currencySymbol(currencyCode: string): string {
  return SYMBOLS[currencyCode] ?? `${currencyCode} `;
}

export function money(amountMinor: number, currencyCode: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`amountMinor must be an integer, received ${amountMinor}`);
  }
  return { amountMinor, currencyCode };
}

/**
 * Parses a major-unit string ("2,340.50") into minor units (234050).
 *
 * Deliberately string-based. `Math.round(parseFloat(x) * 100)` is correct for
 * small values but silently wrong for large ones, and this function guards the
 * integrity of every number in the app.
 */
export function parseMajorToMinor(input: string, currencyCode: string): Money {
  const cleaned = input.trim().replace(/,/g, '');
  const hasDigit = /\d/.test(cleaned);
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || !hasDigit) {
    throw new Error(`invalid money input: "${input}"`);
  }

  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole = '', fraction = ''] = unsigned.split('.');

  const exponent = minorExponent(currencyCode);
  if (fraction.length > exponent) {
    throw new Error(
      `too much precision for ${currencyCode}: "${input}" exceeds ${exponent} decimal places`,
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const digits = `${whole === '' ? '0' : whole}${padded}`;
  const magnitude = Number.parseInt(digits, 10);

  return money(negative ? -magnitude : magnitude, currencyCode);
}

export function formatMoney(value: Money): string {
  const exponent = minorExponent(value.currencyCode);
  const symbol = SYMBOLS[value.currencyCode] ?? `${value.currencyCode} `;
  const negative = value.amountMinor < 0;
  const magnitude = Math.abs(value.amountMinor);

  const divisor = 10 ** exponent;
  const whole = Math.floor(magnitude / divisor);
  const fraction = magnitude % divisor;

  const groupedWhole = whole.toLocaleString('en-US');
  const body =
    exponent === 0
      ? groupedWhole
      : `${groupedWhole}.${String(fraction).padStart(exponent, '0')}`;

  return `${negative ? '-' : ''}${symbol}${body}`;
}

/**
 * Writes an amount the way the keypad holds it: major units, no symbol, no
 * grouping — "420.50", not "₱420.50" and not "420.5".
 *
 * The trailing zeros matter. AmountKeypad appends digits and caps the fraction
 * at the currency's exponent, so seeding it with "420.5" leaves room for one
 * more decimal place and the next key press produces "420.55".
 *
 * `formatMoney` cannot do this job: its output carries a currency symbol, which
 * `parseMajorToMinor` will not read back.
 */
export function minorToMajorString(amountMinor: number, currencyCode: string): string {
  const exponent = minorExponent(currencyCode);
  // Integer arithmetic throughout. Dividing by 10**exponent would put money
  // through a float, which is the one thing this module exists to avoid.
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, '0');
  const sign = amountMinor < 0 ? '-' : '';

  if (exponent === 0) return `${sign}${digits}`;

  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}
