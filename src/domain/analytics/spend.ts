import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';

export interface SpendSlice {
  readonly key: string;
  readonly totalMinor: number;
  readonly stopCount: number;
}

/** Stops with no subkind still belong to the total, so they get their own bucket. */
export const UNSORTED_SUBKIND = 'unsorted';

const totalExpr = sql<number>`sum(${stops.amountMinor})`;
const countExpr = sql<number>`count(${stops.id})`;

function monthScoped(db: AppDatabase, scope: CoupleScope, periodMonth: string) {
  return db
    .select({ kind: stops.kind, subkind: stops.subkind, total: totalExpr, stops: countExpr })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(stops.deletedAt),
        // Attribution follows the parent date's local day, never the stop's own
        // timestamp — a date past midnight counts entirely in one month.
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    );
}

export function spendByKind(db: AppDatabase, scope: CoupleScope, periodMonth: string): SpendSlice[] {
  return monthScoped(db, scope, periodMonth)
    .groupBy(stops.kind)
    .orderBy(desc(totalExpr))
    .all()
    .map((row) => ({
      key: row.kind,
      totalMinor: Number(row.total ?? 0),
      stopCount: Number(row.stops ?? 0),
    }));
}

export function spendBySubkind(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
  kind: string,
): SpendSlice[] {
  return db
    .select({
      subkind: sql<string>`coalesce(${stops.subkind}, ${UNSORTED_SUBKIND})`,
      total: totalExpr,
      stops: countExpr,
    })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        eq(stops.kind, kind),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .groupBy(sql`coalesce(${stops.subkind}, ${UNSORTED_SUBKIND})`)
    .orderBy(desc(totalExpr))
    .all()
    .map((row) => ({
      key: row.subkind,
      totalMinor: Number(row.total ?? 0),
      stopCount: Number(row.stops ?? 0),
    }));
}
