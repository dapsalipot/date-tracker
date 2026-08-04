import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import { newId } from '@/db/id';
import type { AppDatabase } from '@/db/types';
import type { Clock } from '@/domain/clock';
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
  clock: Clock,
  input: CaptureStopInput,
): CaptureResult {
  const now = clock.nowMs();
  const today = clock.todayLocal();

  const openDrafts = db
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
  const dateId = existing?.id ?? newId();
  const createdDate = existing === undefined;

  if (createdDate) {
    db.insert(dates)
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
    db.update(dates).set({ updatedAt: now }).where(eq(dates.id, dateId)).run();
  }

  const siblings = db
    .select()
    .from(stops)
    .where(and(eq(stops.dateId, dateId), isNull(stops.deletedAt)))
    .all();

  const stopId = newId();
  db.insert(stops)
    .values({
      id: stopId,
      dateId,
      sortOrder: siblings.length,
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

  return { stopId, dateId, createdDate };
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
