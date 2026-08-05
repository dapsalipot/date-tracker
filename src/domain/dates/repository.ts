import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';
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
}

/**
 * Returns the query builder WITHOUT executing it. Drizzle's `useLiveQuery`
 * subscribes to a query object, not to an array, so the builder and the
 * executed result are exposed separately: screens use the builder for
 * reactivity, tests use `listFeedDates` for a plain value.
 */
export function feedDatesQuery(db: AppDatabase, coupleId: string) {
  return db
    .select({
      id: dates.id,
      title: dates.title,
      occurredOn: dates.occurredOn,
      status: dates.status,
      stopCount: sql<number>`count(${stops.id})`,
      totalMinor: sql<number>`coalesce(sum(${stops.amountMinor}), 0)`,
    })
    .from(dates)
    .leftJoin(stops, and(eq(stops.dateId, dates.id), isNull(stops.deletedAt)))
    .where(and(eq(dates.coupleId, coupleId), isNull(dates.deletedAt)))
    .groupBy(dates.id)
    .orderBy(desc(dates.occurredOn));
}

export function toFeedDate(row: FeedDateRow): FeedDate {
  return {
    id: row.id,
    title: row.title,
    occurredOn: row.occurredOn,
    status: row.status,
    stopCount: Number(row.stopCount),
    totalMinor: Number(row.totalMinor),
    currencyCode: 'PHP',
  };
}

export function listFeedDates(db: AppDatabase, coupleId: string): FeedDate[] {
  return feedDatesQuery(db, coupleId).all().map(toFeedDate);
}
