import { and, desc, eq, isNull, ne, isNotNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { monthRangeScope } from './scope';
import { trailingMonths } from './period';

export interface PlaceTotal {
  readonly placeName: string;
  readonly totalMinor: number;
  readonly visits: number;
}

const totalExpr = sql<number>`sum(${stops.amountMinor})`;

/**
 * Ranks places by spend over the trailing window ending `endMonth` — not the
 * selected month alone. Five places from a single month is mostly noise, and
 * spec §8 lists this alongside the other trailing-window dashboard items.
 */
export function topPlaces(
  db: AppDatabase,
  scope: CoupleScope,
  endMonth: string,
  limit = 5,
  months = 12,
): PlaceTotal[] {
  const window = trailingMonths(endMonth, months);
  const first = window[0];
  const last = window[window.length - 1];
  if (first === undefined || last === undefined) return [];

  return db
    .select({
      placeName: stops.placeName,
      total: totalExpr,
      visits: sql<number>`count(${stops.id})`,
    })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(and(
      monthRangeScope(scope, first, last),
      // place_name is free text and usually blank; an unlabelled row would
      // top the chart on most couples' data and tell them nothing.
      isNotNull(stops.placeName),
      ne(stops.placeName, ''),
    ))
    .groupBy(stops.placeName)
    .orderBy(desc(totalExpr))
    .limit(limit)
    .all()
    .map((row) => ({
      // Not-null and non-empty is enforced by the where clause above.
      placeName: row.placeName as string,
      totalMinor: Number(row.total ?? 0),
      visits: Number(row.visits ?? 0),
    }));
}
