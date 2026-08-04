const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function periodMonthFor(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`expected ISO date YYYY-MM-DD, received "${isoDate}"`);
  }
  return isoDate.slice(0, 7);
}

function daysInMonth(periodMonth: string): number {
  const [yearText = '', monthText = ''] = periodMonth.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days left in the period counting today, or 0 if today is outside it. */
export function daysRemainingIn(periodMonth: string, todayLocal: string): number {
  if (periodMonthFor(todayLocal) !== periodMonth) return 0;
  const day = Number.parseInt(todayLocal.slice(8, 10), 10);
  return daysInMonth(periodMonth) - day + 1;
}
