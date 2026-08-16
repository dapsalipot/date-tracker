const PERIOD_MONTH = /^\d{4}-\d{2}$/;

function assertPeriodMonth(periodMonth: string): void {
  if (!PERIOD_MONTH.test(periodMonth)) {
    throw new Error(`expected a period month YYYY-MM, received "${periodMonth}"`);
  }
}

/**
 * Month arithmetic on the key itself rather than via Date. Period keys are
 * compared as strings against `substr(occurred_on, 1, 7)`, so the only thing
 * that matters is producing a correctly zero-padded YYYY-MM — and going
 * through Date invites a timezone shifting the answer by a month at the edges.
 */
export function shiftMonth(periodMonth: string, delta: number): string {
  assertPeriodMonth(periodMonth);
  const [yearText = '', monthText = ''] = periodMonth.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  const zeroBased = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = zeroBased - shiftedYear * 12 + 1;

  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/** `count` months ending at `endMonth` inclusive, oldest first. */
export function trailingMonths(endMonth: string, count: number): string[] {
  assertPeriodMonth(endMonth);
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
}
