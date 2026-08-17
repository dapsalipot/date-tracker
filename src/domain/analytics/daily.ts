import { eq, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { monthScope } from './scope';

export interface DaySpend {
  /** ISO `YYYY-MM-DD`, couple-local. */
  readonly occurredOn: string;
  readonly totalMinor: number;
  /** The kind that cost the most that day — the calendar cell's single dot. */
  readonly dominantKind: string;
}

/**
 * Per-day spend for one month, for the calendar grid's heat map.
 *
 * Sparse by design: only days that have spend appear. The grid draws all 31
 * cells itself, so returning zero rows for empty days would be noise the
 * caller has to filter back out.
 *
 * SQL does the aggregation, grouped by day AND kind. Folding those groups down
 * to one row per day is not a second aggregation — it is picking the max of an
 * already-summed set, which SQL cannot express here without a window function
 * this schema does not need.
 */
export function dailySpend(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
): DaySpend[] {
  const rows = db
    .select({
      occurredOn: dates.occurredOn,
      kind: stops.kind,
      total: sql<number>`sum(${stops.amountMinor})`,
    })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(monthScope(scope, periodMonth))
    .groupBy(dates.occurredOn, stops.kind)
    .all();

  const byDay = new Map<string, { totalMinor: number; dominantKind: string; dominantMinor: number }>();

  for (const row of rows) {
    const amount = Number(row.total ?? 0);
    const existing = byDay.get(row.occurredOn);

    if (existing === undefined) {
      byDay.set(row.occurredOn, {
        totalMinor: amount,
        dominantKind: row.kind,
        dominantMinor: amount,
      });
      continue;
    }

    existing.totalMinor += amount;
    // Biggest spend, not most frequent: a day of jeepney fares alongside one
    // expensive dinner was about the dinner.
    if (amount > existing.dominantMinor) {
      existing.dominantKind = row.kind;
      existing.dominantMinor = amount;
    }
  }

  return [...byDay].map(([occurredOn, day]) => ({
    occurredOn,
    totalMinor: day.totalMinor,
    dominantKind: day.dominantKind,
  }));
}
