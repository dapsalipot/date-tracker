import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { monthScope } from './scope';

export interface SpendSlice {
  readonly key: string;
  readonly totalMinor: number;
  readonly stopCount: number;
}

/** Stops with no subkind still belong to the total, so they get their own bucket. */
export const UNSORTED_SUBKIND = 'unsorted';

const totalExpr = sql<number>`sum(${stops.amountMinor})`;
const countExpr = sql<number>`count(${stops.id})`;

export function spendByKind(db: AppDatabase, scope: CoupleScope, periodMonth: string): SpendSlice[] {
  return db
    .select({ kind: stops.kind, total: totalExpr, stops: countExpr })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(monthScope(scope, periodMonth))
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
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(and(monthScope(scope, periodMonth), eq(stops.kind, kind)))
    .groupBy(sql`coalesce(${stops.subkind}, ${UNSORTED_SUBKIND})`)
    .orderBy(desc(totalExpr))
    .all()
    .map((row) => ({
      key: row.subkind,
      totalMinor: Number(row.total ?? 0),
      stopCount: Number(row.stops ?? 0),
    }));
}
