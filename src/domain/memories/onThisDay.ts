import { and, desc, sql } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { feedDateSelection, toFeedDate, type FeedDate } from '@/domain/dates/repository';
import type { CoupleScope } from '@/domain/scope';

/**
 * Dates that fell on this same month/day in an earlier year — "a year ago
 * today you were at the waterfall". Built on `feedDateSelection` so these
 * render as ordinary date cards (kinds, places, cover photo all come along).
 */
export function onThisDay(
  db: AppDatabase,
  scope: CoupleScope,
  todayLocal: string,
): FeedDate[] {
  const monthDay = todayLocal.slice(5); // 'MM-DD'

  return feedDateSelection(db, scope, 'published')
    .having(
      and(
        sql`substr(${dates.occurredOn}, 6, 5) = ${monthDay}`,
        sql`${dates.occurredOn} < ${todayLocal}`,
      ),
    )
    .orderBy(desc(dates.occurredOn))
    .all()
    .map((row) => toFeedDate(row, scope.currencyCode));
}
