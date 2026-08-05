import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { dates, stops } from '@/db/schema';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { deleteStop, listStopsForDate, reorderStops, updateStop } from './edit';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');
const OTHER_DAY = testDeps(1_785_100_000_000, '2026-08-04', 'other');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 100, currencyCode: 'PHP' } as const;
  const a = captureStop(db, DEPS, { ...base, kind: 'food' });
  const b = captureStop(db, DEPS, { ...base, kind: 'transport' });
  return { db, ctx, dateId: a.dateId, a: a.stopId, b: b.stopId };
}

describe('listStopsForDate', () => {
  it('returns stops in sort order, not insertion order', () => {
    const { db, dateId, a, b } = setup();
    // Insertion order is [a, b]. Invert the sort keys so a query with no
    // ORDER BY — which returns rowid, i.e. insertion, order — is wrong.
    db.update(stops).set({ sortOrder: 5 }).where(eq(stops.id, a)).run();
    db.update(stops).set({ sortOrder: 1 }).where(eq(stops.id, b)).run();

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });
});

describe('updateStop', () => {
  it('patches only the given fields', () => {
    const { db, dateId, a } = setup();
    updateStop(db, DEPS, a, { placeName: 'Bag of Beans', amountMinor: 45000 });

    updateStop(db, DEPS, a, { label: 'Morning coffee' });

    const stop = listStopsForDate(db, dateId).find((s) => s.id === a);
    expect(stop?.label).toBe('Morning coffee');
    // Neither field appeared in the second patch. An implementation that
    // writes every column unconditionally would null placeName and zero the
    // amount — silently destroying data on an unrelated edit.
    expect(stop?.placeName).toBe('Bag of Beans');
    expect(stop?.amountMinor).toBe(45000);
  });

  it('bumps the owning date so the feed sees the change', () => {
    const { db, dateId, a } = setup();
    const dateUpdatedAt = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = dateUpdatedAt();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    updateStop(db, later, a, { amountMinor: 50000 });

    expect(dateUpdatedAt()).toBe(1_785_999_999_999);
    expect(dateUpdatedAt()).not.toBe(before);
  });
});

describe('deleteStop', () => {
  it('tombstones and leaves the remaining order intact', () => {
    const { db, dateId, a, b } = setup();

    deleteStop(db, DEPS, a);

    const remaining = listStopsForDate(db, dateId);
    expect(remaining.map((s) => s.id)).toEqual([b]);
    expect(remaining[0]?.sortOrder).toBe(1);

    // The row must still be there. Asserting only that it left the filtered
    // list is satisfied just as well by a hard delete, which would destroy
    // the row v2's sync needs in order to propagate the deletion.
    const raw = db
      .select({ id: stops.id, deletedAt: stops.deletedAt })
      .from(stops)
      .where(eq(stops.id, a))
      .all();
    expect(raw).toHaveLength(1);
    expect(raw[0]?.deletedAt).toBe(1_785_000_000_000);
  });

  it('bumps the owning date so the feed sees the change', () => {
    const { db, dateId, a } = setup();
    const dateUpdatedAt = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = dateUpdatedAt();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    deleteStop(db, later, a);

    expect(dateUpdatedAt()).toBe(1_785_999_999_999);
    expect(dateUpdatedAt()).not.toBe(before);
  });
});

describe('reorderStops', () => {
  it('renumbers to match the given order', () => {
    const { db, dateId, a, b } = setup();

    reorderStops(db, DEPS, dateId, [b, a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });

  it('bumps the owning date so the feed sees the change', () => {
    const { db, dateId, a, b } = setup();
    const dateUpdatedAt = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = dateUpdatedAt();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    reorderStops(db, later, dateId, [b, a]);

    expect(dateUpdatedAt()).toBe(1_785_999_999_999);
    expect(dateUpdatedAt()).not.toBe(before);
  });

  it('ignores ids that do not belong to the date', () => {
    const { db, ctx, dateId, a, b } = setup();
    // A real stop on a different date. With the ownership guard gone, reorder
    // would renumber it — silently corrupting another date's timeline.
    const other = captureStop(db, OTHER_DAY, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'gift', amountMinor: 100, currencyCode: 'PHP',
    });

    reorderStops(db, DEPS, dateId, [b, other.stopId, a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
    // The foreign id must not consume a position either: a is 1, not 2.
    expect(listStopsForDate(db, dateId).map((s) => s.sortOrder)).toEqual([0, 1]);
    expect(listStopsForDate(db, other.dateId)[0]?.sortOrder).toBe(0);
  });
});
