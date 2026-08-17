import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { couples, dates, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { dailySpend } from './daily';

const AUG = '2026-08';

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, testDeps(Date.parse('2026-08-18T12:00:00Z'), '2026-08-18', 'boot'));
  return { db, ctx, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode } };
}

function spend(
  db: ReturnType<typeof createTestDb>,
  ctx: { coupleId: string; userId: string },
  kind: string,
  amountMinor: number,
  day: string,
  prefix: string,
) {
  return captureStop(db, testDeps(Date.parse(`${day}T12:00:00Z`), day, prefix), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: kind as 'food', amountMinor, currencyCode: 'PHP',
  });
}

describe('dailySpend', () => {
  it('totals each day that has spend', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-03', 'a');
    spend(db, ctx, 'transport', 8000, '2026-08-03', 'b');
    spend(db, ctx, 'food', 50000, '2026-08-14', 'c');

    const days = dailySpend(db, scope, AUG);

    expect(days).toHaveLength(2);
    expect(days.find((d) => d.occurredOn === '2026-08-03')?.totalMinor).toBe(38000);
    expect(days.find((d) => d.occurredOn === '2026-08-14')?.totalMinor).toBe(50000);
  });

  it('omits days with no spend rather than returning zeroes', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-03', 'a');

    // The calendar grid draws every cell itself; a sparse map is what it wants
    // to colour, and 31 zero rows would be noise the caller has to filter.
    expect(dailySpend(db, scope, AUG).map((d) => d.occurredOn)).toEqual(['2026-08-03']);
  });

  it('names the kind that cost the most that day', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 10000, '2026-08-05', 'a');
    spend(db, ctx, 'gift', 90000, '2026-08-05', 'b');

    // The heat cell carries one dot. The biggest spend is what the day was
    // about — not the most frequent, which would call a day of jeepney fares
    // a transport day even when dinner cost ten times more.
    expect(dailySpend(db, scope, AUG).find((d) => d.occurredOn === '2026-08-05')?.dominantKind).toBe('gift');
  });

  it('counts only the selected month', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-03', 'a');
    spend(db, ctx, 'food', 99000, '2026-07-31', 'b');
    spend(db, ctx, 'food', 99000, '2026-09-01', 'c');

    expect(dailySpend(db, scope, AUG)).toHaveLength(1);
  });

  it('excludes tombstoned stops, tombstoned dates and another couple', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-03', 'a');
    const deadStop = spend(db, ctx, 'food', 70000, '2026-08-04', 'b');
    const deadDate = spend(db, ctx, 'food', 90000, '2026-08-05', 'c');
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, deadStop.stopId)).run();
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, deadDate.dateId)).run();

    db.insert(couples).values({
      id: 'them', currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1,
    }).run();
    db.insert(dates).values({
      id: 'their-date', coupleId: 'them', occurredOn: '2026-08-09', status: 'published',
      createdBy: ctx.userId, updatedAt: 1,
    }).run();
    db.insert(stops).values({
      id: 'their-stop', dateId: 'their-date', sortOrder: 0, kind: 'food',
      amountMinor: 500000, currencyCode: 'PHP', updatedAt: 1,
    }).run();

    const days = dailySpend(db, scope, AUG);

    expect(days).toHaveLength(1);
    expect(days[0]?.occurredOn).toBe('2026-08-03');
  });

  it('excludes another currency', () => {
    const { db, ctx, scope } = setup();
    const php = spend(db, ctx, 'food', 30000, '2026-08-03', 'a');
    db.insert(stops).values({
      id: 'yen', dateId: php.dateId, sortOrder: 9, kind: 'shopping',
      amountMinor: 900000, currencyCode: 'JPY', updatedAt: 1,
    }).run();

    expect(dailySpend(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });
});
