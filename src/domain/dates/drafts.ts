import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { feedDateSelection, toFeedDate, type FeedDate } from './repository';

/** Oldest first: the longest-neglected draft is the one worth nudging hardest. */
export function draftDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return feedDateSelection(db, scope, 'draft').orderBy(asc(dates.occurredOn));
}

export function publishedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return feedDateSelection(db, scope, 'published').orderBy(desc(dates.occurredOn));
}

export function listDraftDates(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return draftDatesQuery(db, scope).all().map((row) => toFeedDate(row, scope.currencyCode));
}

export interface QueuedStop {
  id: string;
  dateId: string;
  kind: string;
  label: string | null;
  placeName: string | null;
  amountMinor: number;
  currencyCode: string;
  occurredAt: number | null;
}

/**
 * Every stop sitting on a draft — captured but not yet finished into a date.
 * The feed's header lists these, so a total alone is not enough: the user
 * wants to see what they actually logged and when.
 *
 * Newest first: the thing just captured is the thing being checked.
 */
export function listQueuedStops(db: AppDatabase, scope: CoupleScope): QueuedStop[] {
  return db
    .select({
      id: stops.id,
      dateId: stops.dateId,
      kind: stops.kind,
      label: stops.label,
      placeName: stops.placeName,
      amountMinor: stops.amountMinor,
      currencyCode: stops.currencyCode,
      occurredAt: stops.occurredAt,
    })
    .from(stops)
    .innerJoin(dates, eq(dates.id, stops.dateId))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(dates.status, 'draft'),
        isNull(dates.deletedAt),
        isNull(stops.deletedAt),
        eq(stops.currencyCode, scope.currencyCode),
      ),
    )
    .orderBy(desc(stops.occurredAt))
    .all();
}
