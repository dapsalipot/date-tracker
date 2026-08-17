import { and, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { monthRangeScope, monthScope } from './scope';
import { trailingMonths } from './period';

export interface MonthTotal {
  readonly periodMonth: string;
  readonly totalMinor: number;
}

export interface DateAverage {
  readonly monthMinor: number | null;
  readonly trailingMinor: number | null;
  readonly monthDateCount: number;
}

/**
 * `monthScope` scopes to one month by equality and doesn't fit a
 * range query, so the couple/currency/tombstone filters are repeated here
 * rather than forced through it — see the task report for why extracting a
 * range-shaped sibling wasn't done in this pass.
 */
export function monthlyTrend(
  db: AppDatabase,
  scope: CoupleScope,
  endMonth: string,
  months = 12,
): MonthTotal[] {
  const window = trailingMonths(endMonth, months);
  const first = window[0];
  const last = window[window.length - 1];
  if (first === undefined || last === undefined) return [];

  const rows = db
    .select({
      periodMonth: sql<string>`substr(${dates.occurredOn}, 1, 7)`,
      total: sql<number>`sum(${stops.amountMinor})`,
    })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(monthRangeScope(scope, first, last))
    .groupBy(sql`substr(${dates.occurredOn}, 1, 7)`)
    .all();

  const byMonth = new Map(rows.map((row) => [row.periodMonth, Number(row.total ?? 0)]));
  // Densify: the query returns only months that have rows.
  return window.map((periodMonth) => ({
    periodMonth,
    totalMinor: byMonth.get(periodMonth) ?? 0,
  }));
}

/**
 * Sum and distinct-date-count for a scope predicate. `count(distinct dates.id)`
 * over the joined rows is exactly "dates with at least one live in-currency
 * stop" — the join already excludes stopless dates, so counting stops instead
 * (plain `count`) would inflate the denominator for any date with 2+ stops.
 */
function aggregateSpend(db: AppDatabase, wherePredicate: ReturnType<typeof monthScope>) {
  const row = db
    .select({
      total: sql<number>`sum(${stops.amountMinor})`,
      dateCount: sql<number>`count(distinct ${dates.id})`,
    })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(wherePredicate)
    .all()[0];
  return { totalMinor: Number(row?.total ?? 0), dateCount: Number(row?.dateCount ?? 0) };
}

/** Money stays integer: `null` (not `0`) when there are no dates, so an empty month doesn't read as "free". */
function meanMinor(totalMinor: number, dateCount: number): number | null {
  return dateCount === 0 ? null : Math.round(totalMinor / dateCount);
}

/**
 * Mean cost per date this month vs. the trailing-window mean (spec §8) — the
 * *are we creeping up* signal. A rising total might just mean more dates; a
 * rising mean means each date costs more.
 */
export function perDateAverage(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
  months = 12,
): DateAverage {
  const window = trailingMonths(periodMonth, months);
  const first = window[0];
  const last = window[window.length - 1];

  const month = aggregateSpend(db, monthScope(scope, periodMonth));
  const trailing = first === undefined || last === undefined
    ? { totalMinor: 0, dateCount: 0 }
    : aggregateSpend(db, monthRangeScope(scope, first, last));

  return {
    monthMinor: meanMinor(month.totalMinor, month.dateCount),
    trailingMinor: meanMinor(trailing.totalMinor, trailing.dateCount),
    monthDateCount: month.dateCount,
  };
}
