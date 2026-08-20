import { desc, gte } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { feedDateSelection, toFeedDate, type FeedDate } from '@/domain/dates/repository';
import type { CoupleScope } from '@/domain/scope';

/** Rated this or higher and it is a favourite. 4 of 5 is "we loved it". */
export const FAVOURITE_THRESHOLD = 4;

/**
 * Dates the couple loved: rated `FAVOURITE_THRESHOLD` or higher, newest
 * first. Built on `feedDateSelection` — see its docstring for why this must
 * never fork the query — so couple scoping, tombstones and the status filter
 * all come along unchanged.
 *
 * The rating predicate goes in `.having()`, not a second `.where()`:
 * `feedDateSelection` already calls `.where()` once, and Drizzle's
 * `.where()` is a plain assignment (`this.config.where = where`) rather than
 * an AND — a second call would replace the couple/tombstone/status scoping
 * instead of adding to it. `milestones.ts` and `onThisDay.ts` hit the same
 * constraint and use `.having()` for their own post-selection filters.
 *
 * SQL's `NULL >= 4` is not true, so an unrated date (rating is null until
 * someone rates it) falls out of `gte` with no special case needed.
 */
export function favourites(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return feedDateSelection(db, scope, 'published')
    .having(gte(dates.rating, FAVOURITE_THRESHOLD))
    .orderBy(desc(dates.occurredOn))
    .all()
    .map((row) => toFeedDate(row, scope.currencyCode));
}
