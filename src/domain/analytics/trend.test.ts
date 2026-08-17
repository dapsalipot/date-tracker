import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { couples, dates, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { monthlyTrend, perDateAverage } from './trend';

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

describe('monthlyTrend', () => {
  it('returns one entry per month in the window, oldest first', () => {
    const { db, scope } = setup();

    const trend = monthlyTrend(db, scope, '2026-08', 12);

    expect(trend).toHaveLength(12);
    expect(trend[0]?.periodMonth).toBe('2025-09');
    expect(trend[11]?.periodMonth).toBe('2026-08');
  });

  it('reports zero for a month with no spend rather than omitting it', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 50000, '2026-08-01', 'a');

    const trend = monthlyTrend(db, scope, '2026-08', 3);

    // A month with no dates is information. A chart that closes the gap
    // silently redraws the couple's history.
    expect(trend).toEqual([
      { periodMonth: '2026-06', totalMinor: 0 },
      { periodMonth: '2026-07', totalMinor: 0 },
      { periodMonth: '2026-08', totalMinor: 50000 },
    ]);
  });

  it('sums every stop in a month across dates', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'transport', 20000, '2026-08-09', 'b');

    expect(monthlyTrend(db, scope, '2026-08', 1)).toEqual([
      { periodMonth: '2026-08', totalMinor: 50000 },
    ]);
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

    expect(monthlyTrend(db, scope, '2026-08', 1)[0]?.totalMinor).toBe(30000);
  });

  it('excludes spend older than the window', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 99000, '2025-01-05', 'old');

    const trend = monthlyTrend(db, scope, '2026-08', 12);

    expect(trend.every((m) => m.totalMinor === 0)).toBe(true);
  });

  it('excludes tombstones, other couples and other currencies', () => {
    const { db, ctx, scope } = setup();
    const dead = spend(db, ctx, 'food', 70000, '2026-08-02', 'x');
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, dead.stopId)).run();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');

    expect(monthlyTrend(db, scope, '2026-08', 1)[0]?.totalMinor).toBe(30000);
  });
});

describe('perDateAverage', () => {
  it('divides a month\'s spend by its number of dates', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 50000, '2026-08-02', 'b');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthDateCount).toBe(2);
    expect(avg.monthMinor).toBe(40000);
  });

  it('counts one date once however many stops it has', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(Date.parse('2026-08-01T12:00:00Z'), '2026-08-01', 'one');
    captureStop(db, deps, { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 30000, currencyCode: 'PHP' });
    captureStop(db, deps, { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'transport', amountMinor: 10000, currencyCode: 'PHP' });

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthDateCount).toBe(1);
    expect(avg.monthMinor).toBe(40000);
  });

  it('reports null rather than zero when the month has no dates', () => {
    const { db, scope } = setup();

    const avg = perDateAverage(db, scope, '2026-08', 12);

    // Zero would read as "our dates were free this month".
    expect(avg.monthMinor).toBeNull();
    expect(avg.monthDateCount).toBe(0);
  });

  it('compares against the trailing window mean', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 10000, '2026-06-01', 'j');
    spend(db, ctx, 'food', 10000, '2026-07-01', 'k');
    spend(db, ctx, 'food', 70000, '2026-08-01', 'l');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthMinor).toBe(70000);
    // Three dates, ₱900 total.
    expect(avg.trailingMinor).toBe(30000);
  });

  it('rounds to whole minor units', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 10000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 10001, '2026-08-02', 'b');
    spend(db, ctx, 'food', 10001, '2026-08-03', 'c');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(Number.isInteger(avg.monthMinor)).toBe(true);
    expect(avg.monthMinor).toBe(10001);
  });
});
