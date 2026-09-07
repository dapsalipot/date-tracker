/**
 * One keystroke on the amount keypad, as a pure function.
 *
 * Extracted from AmountKeypad because its output is fed straight to
 * `parseMajorToMinor`, which throws on a string with no digit in it — and the
 * keypad used to emit exactly one such string: a bare "." from an empty
 * value. Settings parses on every render to disable Save on zero, so that
 * keystroke crashed the screen rather than showing a wrong number.
 *
 * `exponent` is the currency's minor-unit exponent, from `minorExponent`.
 */
export function nextAmount(value: string, key: string, exponent: number): string {
  if (key === '⌫') return value.slice(0, -1);

  const [whole, fraction] = value.split('.');

  if (key === '.') {
    // Zero-exponent currencies (JPY, KRW) have no fractional unit at all —
    // the key is filtered out of the rendered keys, but guard here too.
    if (exponent === 0 || fraction !== undefined) return value;
    // Leading zero, not a bare ".": see the note above.
    return value === '' ? '0.' : `${value}.`;
  }

  if (fraction !== undefined) {
    if (fraction.length >= exponent) return value;
  } else if ((whole ?? '').length >= MAX_INTEGER_DIGITS) {
    return value;
  }

  return value + key;
}

/**
 * Cap on the integer part's digit count, applied regardless of currency.
 * Nothing stops a runaway string of taps otherwise. PHP dates in the tens of
 * thousands of pesos are normal (a resort weekend, a ring); 7 digits allows
 * up to 9,999,999 — two orders of magnitude above that — while still keeping
 * the amount a bounded, sane number.
 */
const MAX_INTEGER_DIGITS = 7;
