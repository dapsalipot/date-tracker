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
  /**
   * Distinct kinds on this date, sorted. `FeedCard` renders `kindSequence`
   * (below) instead — this kept for parity with the raw query and for
   * consumers that want the deduped set rather than the ordered timeline.
   */
  kinds: readonly string[];
  /**
   * Every stop's kind, in stop order, duplicates included — "the shape of the
   * evening at a glance" (spec §8). Unlike `kinds`, this is not deduped or
   * sorted: a dinner → gig → late-night-food evening stays `[food, activity,
   * food]`, not the sorted, distinct `[activity, food]` `kinds` gives. This is
   * what the feed's icon row renders.
   */
  kindSequence: readonly string[];
  /** Distinct place names on this date, in first-captured order. */
  places: readonly string[];
  /** Count of distinct people who paid for a stop on this date. */
  payerCount: number;
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
  kinds: string | null;
  kindSequence: string | null;
  places: string | null;
  payerCount: number;
}

/**
 * SQLite forbids a custom `group_concat` separator alongside `DISTINCT`, so
 * `places` and `kindSequence` below (neither deduped in SQL — see
 * `toFeedDate`) join on `char(31)` — the ASCII unit separator — instead of a
 * comma. A comma can't be used there: place names are free text (`Bo's
 * Coffee, BGC` would split into two places), unlike `kinds`, which stays
 * comma-joined because it's a closed enum. Matched by `GROUP_CONCAT_SEP`
 * below when splitting the result back apart.
 */
export const GROUP_CONCAT_SEP = '\x1F';

/**
 * The select + joins shared by `feedDatesQuery` here and `drafts.ts`'s
 * `scopedQuery` — one couple's dates with their stop aggregates. Kept as one
 * builder because two independently hand-maintained copies already produced
 * a near-miss: a field added to one and not the other ships `undefined` at
 * runtime with a green suite, since nothing type-checks a raw SQL column list
 * against `FeedDateRow`.
 *
 * `status`, left undefined, returns every status (`feedDatesQuery`'s use);
 * passed, scopes to just that status (`scopedQuery`'s use). Callers add their
 * own `.orderBy()` — draft and published feeds sort oldest/newest first
 * respectively.
 */
export function feedDateSelection(db: AppDatabase, scope: CoupleScope, status?: string) {
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
      // Ordered and not distinct: "the stop timeline as a row of kind icons
      // in stop order" (spec §8) needs repeats and sequence, which `kinds`
      // (distinct, alphabetically sorted) throws away.
      kindSequence: sql<string | null>`group_concat(${stops.kind}, char(31) order by ${stops.sortOrder})`,
      places: sql<string | null>`group_concat(${stops.placeName}, char(31))`,
      payerCount: sql<number>`count(distinct ${stops.paidByUserId})`,
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
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        isNull(dates.deletedAt),
        status !== undefined ? eq(dates.status, status) : undefined,
      ),
    )
    .groupBy(dates.id);
}

/**
 * Returns the query builder WITHOUT executing it. No screen subscribes to
 * this one with `useLiveQuery` any more — `app/index.tsx` uses
 * `draftDatesQuery`/`publishedDatesQuery` from `./drafts` instead. This stays
 * as the honest "all dates for the couple" read: `listFeedDates`, built on
 * it, is exercised directly by tests in this file and in `seed.test.ts`.
 */
export function feedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return feedDateSelection(db, scope).orderBy(desc(dates.occurredOn));
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
    // group_concat's order is unspecified, so sort for a stable chip order.
    kinds: row.kinds === null ? [] : row.kinds.split(',').sort(),
    kindSequence: row.kindSequence === null ? [] : row.kindSequence.split(GROUP_CONCAT_SEP),
    // Not deduped in SQL (DISTINCT can't share a custom separator with a
    // free-text field — see GROUP_CONCAT_SEP), so dedupe here instead. A Set
    // preserves first-seen order, unlike a sort, which would reorder places
    // alphabetically for no reason a user asked for.
    places: row.places === null ? [] : [...new Set(row.places.split(GROUP_CONCAT_SEP))],
    payerCount: Number(row.payerCount),
  };
}

export function listFeedDates(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return feedDatesQuery(db, scope).all().map((row) => toFeedDate(row, scope.currencyCode));
}
