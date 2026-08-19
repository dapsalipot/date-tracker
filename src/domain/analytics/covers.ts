import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { dates, photos } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';

export interface DayCover {
  readonly occurredOn: string;
  readonly coverUri: string;
}

/**
 * One cover photo per day for a month, so the calendar can show the couple's
 * own pictures instead of coloured dots.
 *
 * Days without a cover are absent rather than present-with-null: the grid
 * chooses between photo and dot on presence, and a null row would make it
 * decide twice.
 *
 * Not routed through `monthScope`: that predicate scopes by `stops.currencyCode`
 * and joins stops, which would multiply rows per date and drop a photographed
 * date whose stops are all in another currency. A cover is a property of the
 * date, not of its spending.
 */
export function dailyCovers(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
): DayCover[] {
  const rows = db
    .select({ occurredOn: dates.occurredOn, coverUri: photos.localUri })
    .from(dates)
    .innerJoin(photos, and(eq(photos.id, dates.coverPhotoId), isNull(photos.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        isNull(dates.deletedAt),
        isNotNull(dates.coverPhotoId),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .orderBy(dates.occurredOn)
    .all();

  // Two dates on one day is legal; the grid has one cell, so the first wins.
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.coverUri !== null && !seen.has(row.occurredOn)) {
      seen.set(row.occurredOn, row.coverUri);
    }
  }
  return [...seen].map(([occurredOn, coverUri]) => ({ occurredOn, coverUri }));
}
