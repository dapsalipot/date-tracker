import { and, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { trailingMonths } from './period';

export interface MonthTotal {
  readonly periodMonth: string;
  readonly totalMinor: number;
}

/**
 * `monthScope` in spend.ts scopes to one month by equality and doesn't fit a
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
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) >= ${first}`,
        sql`substr(${dates.occurredOn}, 1, 7) <= ${last}`,
      ),
    )
    .groupBy(sql`substr(${dates.occurredOn}, 1, 7)`)
    .all();

  const byMonth = new Map(rows.map((row) => [row.periodMonth, Number(row.total ?? 0)]));
  // Densify: the query returns only months that have rows.
  return window.map((periodMonth) => ({
    periodMonth,
    totalMinor: byMonth.get(periodMonth) ?? 0,
  }));
}
