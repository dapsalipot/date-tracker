import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, photos, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';
import { attachPhoto } from '@/domain/photos/repository';
import type { CoupleScope } from '@/domain/scope';
import type { StopKind } from '@/domain/stops/taxonomy';

export interface CaptureStopInput {
  coupleId: string;
  userId: string;
  kind: StopKind;
  subkind?: string | null;
  amountMinor: number;
  currencyCode: string;
  label?: string | null;
  placeName?: string | null;
  /**
   * Attached in the same transaction as the stop. The capture sheet copies the
   * picked image to durable storage *before* calling this, so by the time we
   * are here the file already exists and only the database row is at risk —
   * and it now cannot land half-written. Two separate transactions meant a
   * failure between them left a committed stop the user could not see had
   * saved, so the natural retry wrote a duplicate charge.
   */
  photo?: CapturePhoto | null;
}

export interface CapturePhoto {
  localUri: string;
  width: number;
  height: number;
  takenAt?: number | null;
}

export interface CaptureResult {
  stopId: string;
  dateId: string;
  createdDate: boolean;
}

export interface FeedDate {
  id: string;
  title: string | null;
  occurredOn: string;
  status: string;
  stopCount: number;
  totalMinor: number;
  currencyCode: string;
  coverUri: string | null;
}

/**
 * The implicit-open-date rule: capture never asks which date a stop belongs to.
 * It appends to today's draft, creating one silently if none exists. This is
 * what makes the sub-five-second capture target reachable.
 */
export function captureStop(
  db: AppDatabase,
  deps: Deps,
  input: CaptureStopInput,
): CaptureResult {
  const now = deps.clock.nowMs();
  const today = deps.clock.todayLocal();

  let result: CaptureResult | null = null;

  db.transaction((tx) => {
    const openDrafts = tx
      .select()
      .from(dates)
      .where(
        and(
          eq(dates.coupleId, input.coupleId),
          eq(dates.occurredOn, today),
          eq(dates.status, 'draft'),
          isNull(dates.deletedAt),
        ),
      )
      .orderBy(desc(dates.updatedAt))
      .all();

    const existing = openDrafts[0];
    const dateId = existing?.id ?? deps.newId();
    const createdDate = existing === undefined;

    if (createdDate) {
      tx.insert(dates)
        .values({
          id: dateId,
          coupleId: input.coupleId,
          occurredOn: today,
          status: 'draft',
          createdBy: input.userId,
          startedAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      tx.update(dates).set({ updatedAt: now }).where(eq(dates.id, dateId)).run();
    }

    // MAX over ALL siblings, tombstoned included. Counting only live stops would
    // reuse a number after a delete: with stops at 0, 1, 2, tombstoning the one
    // at 1 leaves two live siblings, so the next capture would be assigned 2 and
    // collide with the stop already there. The (date_id, sort_order) index is not
    // unique, so nothing would catch it — the timeline just loses its order.
    const ordering = tx
      .select({ maxOrder: sql<number | null>`max(${stops.sortOrder})` })
      .from(stops)
      .where(eq(stops.dateId, dateId))
      .all();

    const stopId = deps.newId();
    tx.insert(stops)
      .values({
        id: stopId,
        dateId,
        sortOrder: (ordering[0]?.maxOrder ?? -1) + 1,
        kind: input.kind,
        subkind: input.subkind ?? null,
        label: input.label ?? null,
        placeName: input.placeName ?? null,
        occurredAt: now,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        paidByUserId: input.userId,
        updatedAt: now,
      })
      .run();

    // attachPhoto takes an AppDatabase, and a drizzle transaction satisfies
    // that type, so the photo row joins this transaction rather than opening
    // its own. No duplicated insert, no second commit point.
    // attachPhoto takes an AppDatabase, and a drizzle transaction satisfies
    // that type, so the photo row joins this transaction rather than opening
    // its own. No duplicated insert, no second commit point.
    if (input.photo) {
      attachPhoto(tx, deps, {
        dateId,
        stopId,
        localUri: input.photo.localUri,
        width: input.photo.width,
        height: input.photo.height,
        takenAt: input.photo.takenAt ?? null,
      });
    }

    result = { stopId, dateId, createdDate };
  });

  if (!result) throw new Error('captureStop produced no result');
  return result;
}

export interface FeedDateRow {
  id: string;
  title: string | null;
  occurredOn: string;
  status: string;
  stopCount: number;
  totalMinor: number;
  coverUri: string | null;
}

/**
 * Returns the query builder WITHOUT executing it. No screen subscribes to
 * this one with `useLiveQuery` any more — `app/index.tsx` uses
 * `draftDatesQuery`/`publishedDatesQuery` from `./drafts` instead. This stays
 * as the honest "all dates for the couple" read: `listFeedDates`, built on
 * it, is exercised directly by tests in this file and in `seed.test.ts`.
 */
export function feedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return db
    .select({
      id: dates.id,
      title: dates.title,
      occurredOn: dates.occurredOn,
      status: dates.status,
      coverUri: photos.localUri,
      stopCount: sql<number>`count(${stops.id})`,
      totalMinor: sql<number>`coalesce(sum(${stops.amountMinor}), 0)`,
    })
    .from(dates)
    .leftJoin(
      stops,
      and(
        eq(stops.dateId, dates.id),
        isNull(stops.deletedAt),
        // In the ON clause, not the WHERE: a date whose stops are all in
        // another currency must still appear, with a zero total.
        eq(stops.currencyCode, scope.currencyCode),
      ),
    )
    // Matches at most one row (photos.id is the primary key), so it cannot
    // multiply the stop rows the count and sum are computed over. The
    // deletedAt check belongs in the ON clause: in the WHERE it would turn
    // this into an inner join and drop every date that has no cover.
    .leftJoin(photos, and(eq(photos.id, dates.coverPhotoId), isNull(photos.deletedAt)))
    .where(and(eq(dates.coupleId, scope.coupleId), isNull(dates.deletedAt)))
    .groupBy(dates.id)
    .orderBy(desc(dates.occurredOn));
}

export function toFeedDate(row: FeedDateRow, currencyCode: string): FeedDate {
  return {
    id: row.id,
    title: row.title,
    occurredOn: row.occurredOn,
    status: row.status,
    stopCount: Number(row.stopCount),
    totalMinor: Number(row.totalMinor),
    currencyCode,
    coverUri: row.coverUri,
  };
}

export function listFeedDates(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return feedDatesQuery(db, scope).all().map((row) => toFeedDate(row, scope.currencyCode));
}
