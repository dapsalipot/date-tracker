import { and, asc, eq, isNull } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface StopRow {
  id: string;
  sortOrder: number;
  kind: string;
  subkind: string | null;
  label: string | null;
  placeName: string | null;
  occurredAt: number | null;
  amountMinor: number;
  currencyCode: string;
  paidByUserId: string | null;
}

export interface StopPatch {
  label?: string | null;
  subkind?: string | null;
  placeName?: string | null;
  amountMinor?: number;
  /** Who paid. Omitted leaves the existing attribution untouched. */
  paidByUserId?: string;
}

export function stopsForDateQuery(db: AppDatabase, dateId: string) {
  return db
    .select({
      id: stops.id,
      sortOrder: stops.sortOrder,
      kind: stops.kind,
      subkind: stops.subkind,
      label: stops.label,
      placeName: stops.placeName,
      occurredAt: stops.occurredAt,
      amountMinor: stops.amountMinor,
      currencyCode: stops.currencyCode,
      paidByUserId: stops.paidByUserId,
    })
    .from(stops)
    .where(and(eq(stops.dateId, dateId), isNull(stops.deletedAt)))
    .orderBy(asc(stops.sortOrder));
}

export function listStopsForDate(db: AppDatabase, dateId: string): StopRow[] {
  return stopsForDateQuery(db, dateId).all();
}

/**
 * Bumps the owning date's updated_at. useLiveQuery subscribes to a query's FROM
 * table only, so the feed — which selects FROM dates — never sees a write that
 * touches stops alone. Bumping the parent is what makes a stop edit reach the
 * feed's totals. It is also correct on its own terms: a date whose stops changed
 * has changed, and v2's last-write-wins sync needs to know that.
 */
function touchOwningDate(tx: AppDatabase, dateId: string, now: number): void {
  tx.update(dates).set({ updatedAt: now }).where(eq(dates.id, dateId)).run();
}

export function updateStop(db: AppDatabase, deps: Deps, stopId: string, patch: StopPatch): void {
  const now = deps.clock.nowMs();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.subkind !== undefined) set.subkind = patch.subkind;
  if (patch.placeName !== undefined) set.placeName = patch.placeName;
  if (patch.amountMinor !== undefined) set.amountMinor = patch.amountMinor;
  if (patch.paidByUserId !== undefined) set.paidByUserId = patch.paidByUserId;

  db.transaction((tx) => {
    const owner = tx.select({ dateId: stops.dateId }).from(stops).where(eq(stops.id, stopId)).all()[0];
    tx.update(stops).set(set).where(eq(stops.id, stopId)).run();
    if (owner) touchOwningDate(tx, owner.dateId, now);
  });
}

export function deleteStop(db: AppDatabase, deps: Deps, stopId: string): void {
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    const owner = tx.select({ dateId: stops.dateId }).from(stops).where(eq(stops.id, stopId)).all()[0];
    tx.update(stops).set({ deletedAt: now, updatedAt: now }).where(eq(stops.id, stopId)).run();
    if (owner) touchOwningDate(tx, owner.dateId, now);
  });
}

/**
 * Renumbers to match `orderedIds`. Ids not belonging to this date are ignored
 * rather than throwing — a stale list from a screen that raced a delete should
 * reorder what it can, not fail the whole gesture.
 */
export function reorderStops(
  db: AppDatabase,
  deps: Deps,
  dateId: string,
  orderedIds: readonly string[],
): void {
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    // Read inside the transaction: a snapshot taken outside could race a
    // concurrent delete between the read and the writes below, letting a
    // just-deleted stop be renumbered.
    const owned = new Set(listStopsForDate(tx, dateId).map((s) => s.id));

    let position = 0;
    for (const id of orderedIds) {
      if (!owned.has(id)) continue;
      tx.update(stops).set({ sortOrder: position, updatedAt: now }).where(eq(stops.id, id)).run();
      position += 1;
    }
    touchOwningDate(tx, dateId, now);
  });
}
