import { and, asc, eq, isNull } from 'drizzle-orm';
import { stops } from '@/db/schema';
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
}

export interface StopPatch {
  label?: string | null;
  subkind?: string | null;
  placeName?: string | null;
  amountMinor?: number;
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
    })
    .from(stops)
    .where(and(eq(stops.dateId, dateId), isNull(stops.deletedAt)))
    .orderBy(asc(stops.sortOrder));
}

export function listStopsForDate(db: AppDatabase, dateId: string): StopRow[] {
  return stopsForDateQuery(db, dateId).all();
}

export function updateStop(db: AppDatabase, deps: Deps, stopId: string, patch: StopPatch): void {
  const set: Record<string, unknown> = { updatedAt: deps.clock.nowMs() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.subkind !== undefined) set.subkind = patch.subkind;
  if (patch.placeName !== undefined) set.placeName = patch.placeName;
  if (patch.amountMinor !== undefined) set.amountMinor = patch.amountMinor;

  db.update(stops).set(set).where(eq(stops.id, stopId)).run();
}

export function deleteStop(db: AppDatabase, deps: Deps, stopId: string): void {
  const now = deps.clock.nowMs();
  db.update(stops).set({ deletedAt: now, updatedAt: now }).where(eq(stops.id, stopId)).run();
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
  const owned = new Set(listStopsForDate(db, dateId).map((s) => s.id));

  db.transaction((tx) => {
    let position = 0;
    for (const id of orderedIds) {
      if (!owned.has(id)) continue;
      tx.update(stops).set({ sortOrder: position, updatedAt: now }).where(eq(stops.id, id)).run();
      position += 1;
    }
  });
}
