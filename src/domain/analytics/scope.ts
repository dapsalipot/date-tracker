import { and, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { CoupleScope } from '@/domain/scope';

/**
 * The one scoping predicate every analytics aggregation shares.
 *
 * It exists because this filter set was hand-copied twice and both copies went
 * unguarded: dropping the couple check from either left the whole suite green,
 * so a drill-down or a trend chart could have shown another couple's spending.
 * Written once, one mutation fails every query that uses it.
 *
 * Callers still supply the join themselves — `innerJoin(dates, and(eq(dates.id,
 * stops.dateId), isNull(dates.deletedAt)))` — because a predicate cannot carry
 * a join condition.
 */
export function monthRangeScope(scope: CoupleScope, fromMonth: string, toMonth: string) {
  return and(
    eq(dates.coupleId, scope.coupleId),
    eq(stops.currencyCode, scope.currencyCode),
    isNull(stops.deletedAt),
    // Attribution follows the parent date's local day, never the stop's own
    // timestamp — a date past midnight counts entirely in one month.
    sql`substr(${dates.occurredOn}, 1, 7) >= ${fromMonth}`,
    sql`substr(${dates.occurredOn}, 1, 7) <= ${toMonth}`,
  );
}

/** A single month is a range of one. */
export function monthScope(scope: CoupleScope, periodMonth: string) {
  return monthRangeScope(scope, periodMonth, periodMonth);
}
