import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { monthlyTrend } from './trend';

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
