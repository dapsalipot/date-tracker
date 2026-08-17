import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { couples, dates, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { updateStop } from '@/domain/stops/edit';
import { spendByKind, spendBySubkind } from './spend';

const AUG = '2026-08';

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, testDeps(Date.parse('2026-08-14T12:00:00Z'), '2026-08-14', 'boot'));
  return { db, ctx, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode } };
}

function spend(db: ReturnType<typeof createTestDb>, ctx: { coupleId: string; userId: string },
               kind: string, amountMinor: number, day: string, prefix: string) {
  return captureStop(db, testDeps(Date.parse(`${day}T12:00:00Z`), day, prefix), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: kind as 'food', amountMinor, currencyCode: 'PHP',
  });
}

describe('spendByKind', () => {
  it('ranks kinds by total spend, descending', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 50000, '2026-08-01', 'a');
    spend(db, ctx, 'transport', 8000, '2026-08-02', 'b');
    spend(db, ctx, 'activity', 120000, '2026-08-03', 'c');

    const slices = spendByKind(db, scope, AUG);

    expect(slices.map((s) => s.key)).toEqual(['activity', 'food', 'transport']);
    expect(slices.map((s) => s.totalMinor)).toEqual([120000, 50000, 8000]);
  });

  it('sums repeat spending in the same kind and counts the stops', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 20000, '2026-08-02', 'b');

    const slices = spendByKind(db, scope, AUG);

    expect(slices).toHaveLength(1);
    expect(slices[0]).toEqual({ key: 'food', totalMinor: 50000, stopCount: 2 });
  });

  it('counts only the selected month', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 99000, '2026-07-31', 'b');

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });

  it('counts only the selected month when spend comes after it', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 99000, '2026-09-15', 'future');

    // The existing month test put its decoy BEFORE the target, so the upper
    // bound of the shared predicate was guarded by nothing.
    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });

  it('excludes tombstoned stops and tombstoned dates', () => {
    const { db, ctx, scope } = setup();
    const kept = spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    const deadStop = spend(db, ctx, 'food', 70000, '2026-08-02', 'b');
    const deadDate = spend(db, ctx, 'food', 90000, '2026-08-03', 'c');
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, deadStop.stopId)).run();
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, deadDate.dateId)).run();

    const slices = spendByKind(db, scope, AUG);

    expect(slices[0]?.totalMinor).toBe(30000);
    expect(slices[0]?.stopCount).toBe(1);
    expect(kept.stopId).toBeDefined();
  });

  it("ignores another couple's spending", () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    db.insert(couples).values({
      id: 'them', currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1,
    }).run();
    db.insert(dates).values({
      id: 'their-date', coupleId: 'them', occurredOn: '2026-08-05', status: 'published',
      createdBy: ctx.userId, updatedAt: 1,
    }).run();
    db.insert(stops).values({
      id: 'their-stop', dateId: 'their-date', sortOrder: 0, kind: 'food',
      amountMinor: 500000, currencyCode: 'PHP', updatedAt: 1,
    }).run();

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });

  it('excludes another currency', () => {
    const { db, ctx, scope } = setup();
    const phpStop = spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    db.insert(stops).values({
      id: 'yen', dateId: phpStop.dateId, sortOrder: 8, kind: 'food',
      amountMinor: 900000, currencyCode: 'JPY', updatedAt: 1,
    }).run();

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });
});

describe('spendBySubkind', () => {
  it('breaks one kind down by subkind, descending', () => {
    const { db, ctx, scope } = setup();
    const cafe = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    const dinner = spend(db, ctx, 'food', 80000, '2026-08-02', 'b');
    const deps = testDeps(Date.parse('2026-08-14T12:00:00Z'), '2026-08-14', 'up');
    updateStop(db, deps, cafe.stopId, { subkind: 'cafe' });
    updateStop(db, deps, dinner.stopId, { subkind: 'restaurant' });

    const slices = spendBySubkind(db, scope, AUG, 'food');

    expect(slices.map((s) => s.key)).toEqual(['restaurant', 'cafe']);
    expect(slices.map((s) => s.totalMinor)).toEqual([80000, 20000]);
  });

  it("ignores another couple's spending in the same kind", () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    db.insert(couples).values({
      id: 'them', currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1,
    }).run();
    db.insert(dates).values({
      id: 'their-date', coupleId: 'them', occurredOn: '2026-08-05', status: 'published',
      createdBy: ctx.userId, updatedAt: 1,
    }).run();
    db.insert(stops).values({
      id: 'their-stop', dateId: 'their-date', sortOrder: 0, kind: 'food',
      subkind: 'restaurant', amountMinor: 500000, currencyCode: 'PHP', updatedAt: 1,
    }).run();

    // The drill-down carries the same scoping as the bar it drills into. When
    // these were two hand-written filter sets, every mutation aimed at the bar
    // passed straight through the drill.
    const slices = spendBySubkind(db, scope, AUG, 'food');

    expect(slices.map((s) => s.key)).not.toContain('restaurant');
    expect(slices.reduce((sum, s) => sum + s.totalMinor, 0)).toBe(20000);
  });

  it('groups stops with no subkind under "unsorted"', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 20000, '2026-08-01', 'a');

    const slices = spendBySubkind(db, scope, AUG, 'food');

    // Subkind is optional by design (spec §5). Dropping unlabelled stops would
    // make the drill-down disagree with the bar the user tapped.
    expect(slices).toEqual([{ key: 'unsorted', totalMinor: 20000, stopCount: 1 }]);
  });

  it('sums to the same total as its parent bar', () => {
    const { db, ctx, scope } = setup();
    const a = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 80000, '2026-08-02', 'b');
    updateStop(db, testDeps(1, '2026-08-14', 'up'), a.stopId, { subkind: 'cafe' });

    const parent = spendByKind(db, scope, AUG).find((s) => s.key === 'food');
    const drilled = spendBySubkind(db, scope, AUG, 'food');
    const drilledTotal = drilled.reduce((sum, s) => sum + s.totalMinor, 0);

    expect(drilledTotal).toBe(parent?.totalMinor);
  });
});
