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

export function money(amountMinor: number, currencyCode: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`amountMinor must be an integer, received ${amountMinor}`);
  }
  return { amountMinor, currencyCode };
}

export function zeroMoney(currencyCode: string): Money {
  return { amountMinor: 0, currencyCode };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currencyCode !== b.currencyCode) {
    throw new Error(`currency mismatch: ${a.currencyCode} vs ${b.currencyCode}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currencyCode);
}

export function sumMoney(items: readonly Money[], currencyCode: string): Money {
  return items.reduce<Money>((acc, item) => addMoney(acc, item), zeroMoney(currencyCode));
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
