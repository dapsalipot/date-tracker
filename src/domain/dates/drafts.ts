import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, photos, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { toFeedDate, type FeedDate } from './repository';

function scopedQuery(db: AppDatabase, scope: CoupleScope, status: string) {
  return db
    .select({
      id: dates.id,
      title: dates.title,
      occurredOn: dates.occurredOn,
      status: dates.status,
      coverUri: photos.localUri,
      stopCount: sql<number>`count(${stops.id})`,
      totalMinor: sql<number>`coalesce(sum(${stops.amountMinor}), 0)`,
      kinds: sql<string | null>`group_concat(distinct ${stops.kind})`,
      places: sql<string | null>`group_concat(distinct ${stops.placeName})`,
      payerCount: sql<number>`count(distinct ${stops.paidByUserId})`,
    })
    .from(dates)
    .leftJoin(
      stops,
      and(eq(stops.dateId, dates.id), isNull(stops.deletedAt), eq(stops.currencyCode, scope.currencyCode)),
    )
    // Matches at most one row (photos.id is the primary key), so it cannot
    // multiply the stop rows the count and sum are computed over. The
    // deletedAt check belongs in the ON clause: in the WHERE it would turn
    // this into an inner join and drop every date that has no cover.
    .leftJoin(photos, and(eq(photos.id, dates.coverPhotoId), isNull(photos.deletedAt)))
    .where(and(eq(dates.coupleId, scope.coupleId), eq(dates.status, status), isNull(dates.deletedAt)))
    .groupBy(dates.id);
}

/** Oldest first: the longest-neglected draft is the one worth nudging hardest. */
export function draftDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return scopedQuery(db, scope, 'draft').orderBy(asc(dates.occurredOn));
}

export function publishedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return scopedQuery(db, scope, 'published').orderBy(desc(dates.occurredOn));
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
