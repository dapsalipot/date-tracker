import { describe, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop, listFeedDates } from './repository';
import type { AppDatabase } from '@/db/types';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03', 'aug3');
const AUG_4 = testDeps(1_785_090_000_000, '2026-08-04', 'aug4');

function setup(): { db: AppDatabase; coupleId: string; userId: string } {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_3);
  return { db, coupleId: ctx.coupleId, userId: ctx.userId };
}

describe('captureStop', () => {
  it('creates a draft date when none exists for today', () => {
    const { db, coupleId, userId } = setup();

    const result = captureStop(db, AUG_3, {
      coupleId,
      userId,
      kind: 'food',
      amountMinor: 42000,
      currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);

    const rows = db.select().from(dates).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('draft');
    expect(rows[0]?.occurredOn).toBe('2026-08-03');
  });

  it('appends to today\'s existing draft instead of creating another', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const second = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    expect(second.createdDate).toBe(false);
    expect(second.dateId).toBe(first.dateId);
    expect(db.select().from(dates).all()).toHaveLength(1);
    expect(db.select().from(stops).all()).toHaveLength(2);
  });

  it('increments sort_order in capture order', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP' });

    const orders = db.select().from(stops).all().map((s) => s.sortOrder).sort();
    expect(orders).toEqual([0, 1]);
  });

  it('starts a new date on a new day', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });

    expect(db.select().from(dates).all()).toHaveLength(2);
  });

  it('picks the most recently updated draft when today has two', () => {
    const { db, coupleId, userId } = setup();

    // Two drafts for the same day can exist if one was created by a future
    // import path. Capture must never ask the user to disambiguate.
    const older = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });
    db.insert(dates).values({
      id: 'second-draft', coupleId, occurredOn: '2026-08-03', status: 'draft',
      createdBy: userId, updatedAt: AUG_3.clock.nowMs() + 5_000,
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('second-draft');
    expect(result.dateId).not.toBe(older.dateId);
  });

  it('orders drafts by updated_at, not by insertion order or id', () => {
    const { db, coupleId, userId } = setup();
    const base = AUG_3.clock.nowMs();

    // The winner ('mmmm') is neither the first nor the last inserted, and has
    // neither the lowest nor the highest id. Only ORDER BY updated_at DESC can
    // select it — every other plausible ordering picks 'aaaa' or 'zzzz'.
    for (const [id, updatedAt] of [
      ['aaaa-draft', base + 1_000],
      ['mmmm-draft', base + 9_000],
      ['zzzz-draft', base + 2_000],
    ] as const) {
      db.insert(dates).values({
        id, coupleId, occurredOn: '2026-08-03', status: 'draft',
        createdBy: userId, updatedAt,
      }).run();
    }

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('mmmm-draft');
  });

  it('never reuses a sort_order after a stop is tombstoned', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    const second = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 3, currencyCode: 'PHP' });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, second.stopId)).run();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 4, currencyCode: 'PHP' });

    const live = db.select().from(stops).where(isNull(stops.deletedAt)).all();
    const orders = live.map((s) => s.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 2, 3]);
    expect(new Set(orders).size).toBe(orders.length);
    expect(first.stopId).not.toBe(second.stopId);
  });

  it('ignores published dates when finding today\'s draft', () => {
    const { db, coupleId, userId } = setup();

    db.insert(dates).values({
      id: 'published', coupleId, occurredOn: '2026-08-03', status: 'published',
      createdBy: userId, updatedAt: AUG_3.clock.nowMs(),
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);
    expect(result.dateId).not.toBe('published');
  });
});

describe('listFeedDates', () => {
  it('returns dates with stop counts and totals, newest first', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP' });

    const feed = listFeedDates(db, coupleId);

    expect(feed).toHaveLength(2);
    expect(feed[0]?.occurredOn).toBe('2026-08-04');
    expect(feed[1]?.stopCount).toBe(2);
    expect(feed[1]?.totalMinor).toBe(110000);
  });

  it('excludes tombstoned stops from counts and totals', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    const removed = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, removed.stopId)).run();

    const feed = listFeedDates(db, coupleId);
    expect(feed[0]?.stopCount).toBe(1);
    expect(feed[0]?.totalMinor).toBe(42000);
  });

  it('keeps a date visible when every one of its stops is tombstoned', () => {
    const { db, coupleId, userId } = setup();

    const only = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, only.stopId)).run();

    // Guards the leftJoin ON-clause: moving isNull(stops.deletedAt) into the
    // WHERE clause would make this date vanish from the feed entirely.
    const feed = listFeedDates(db, coupleId);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.stopCount).toBe(0);
    expect(feed[0]?.totalMinor).toBe(0);
  });

  it('excludes soft-deleted dates and stops', () => {
    const { db, coupleId, userId } = setup();

    const kept = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const removed = captureStop(db, AUG_4, {
      coupleId, userId, kind: 'food', amountMinor: 99000, currencyCode: 'PHP',
    });

    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, removed.dateId)).run();

    const feed = listFeedDates(db, coupleId);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.id).toBe(kept.dateId);
  });
});
