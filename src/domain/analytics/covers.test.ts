import { describe, expect, it, vi } from 'vitest';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { seedTwelveMonths } from '@/fixtures/seed';

/**
 * Every test here seeds a full year through `seedTwelveMonths`, and
 * better-sqlite3 is synchronous. Alone each runs in about a second, but vitest
 * runs test files in parallel worker threads, so under a full-suite run they
 * compete for a core — this file has measured 5.8s against the default 5s
 * budget and gone red for no reason but scheduling. The work is genuinely this
 * size, so the budget is what gets raised, and file-wide rather than
 * test-by-test: a per-test timeout rescues whichever test lost the race that
 * day and leaves its neighbours to fail next time.
 */
vi.setConfig({ testTimeout: 30_000 });
import { attachPhoto } from '@/domain/photos/repository';
import { setCoverPhoto } from '@/domain/dates/cover';
import { dates, photos } from '@/db/schema';
import { dailyCovers } from './covers';

const AUG = testDeps(1_785_000_000_000, '2026-08-19');

function seeded() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG);
  seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-19', AUG);
  return { db, ctx };
}

/** Seeded dates for this couple, in a given month, oldest first. */
function datesInMonth(db: ReturnType<typeof createTestDb>, coupleId: string, month: string) {
  return db
    .select({ id: dates.id, occurredOn: dates.occurredOn })
    .from(dates)
    .where(and(eq(dates.coupleId, coupleId), sql`substr(${dates.occurredOn}, 1, 7) = ${month}`))
    .orderBy(dates.occurredOn)
    .all();
}

/**
 * seedTwelveMonths never attaches a photo, let alone a cover — that only
 * happens through the composer, which this fixture doesn't drive — so any
 * test that needs a date with (or without) a cover has to set it up itself.
 */
function giveCover(db: ReturnType<typeof createTestDb>, dateId: string, uri = 'file://cover.jpg') {
  const photoId = attachPhoto(db, AUG, { dateId, localUri: uri, width: 100, height: 100 });
  setCoverPhoto(db, AUG, dateId, photoId);
}

describe('dailyCovers', () => {
  it('returns at most one cover per day', () => {
    const { db, ctx } = seeded();
    const [first] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!first) throw new Error('fixture produced no August dates');
    giveCover(db, first.id);

    // A second date landing on the same day is legal — the grid still has
    // only one cell for it.
    db.insert(dates)
      .values({
        id: 'same-day-extra',
        coupleId: ctx.coupleId,
        occurredOn: first.occurredOn,
        status: 'published',
        createdBy: ctx.userId,
        updatedAt: 1,
      })
      .run();
    giveCover(db, 'same-day-extra', 'file://cover-2.jpg');

    const rows = dailyCovers(db, ctx, '2026-08');
    const days = rows.map((r) => r.occurredOn);
    expect(new Set(days).size).toBe(days.length);
  });

  it('only returns days inside the month asked for', () => {
    const { db, ctx } = seeded();
    const [augDate] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!augDate) throw new Error('fixture produced no August dates');
    giveCover(db, augDate.id);

    db.insert(dates)
      .values({
        id: 'july-date',
        coupleId: ctx.coupleId,
        occurredOn: '2026-07-15',
        status: 'published',
        createdBy: ctx.userId,
        updatedAt: 1,
      })
      .run();
    giveCover(db, 'july-date', 'file://july.jpg');

    const rows = dailyCovers(db, ctx, '2026-08');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.occurredOn.slice(0, 7)).toBe('2026-08');
    }
  });

  it('never returns a null uri', () => {
    // A day with no cover must be absent, not present-with-null: the grid
    // decides between photo and dot on presence alone.
    const { db, ctx } = seeded();
    const [augDate] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!augDate) throw new Error('fixture produced no August dates');
    giveCover(db, augDate.id);

    const rows = dailyCovers(db, ctx, '2026-08');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.coverUri).toBe('string');
      expect(r.coverUri.length).toBeGreaterThan(0);
    }
  });

  it('drops a day whose date was deleted', () => {
    const { db, ctx } = seeded();
    const [augDate] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!augDate) throw new Error('fixture produced no August dates');
    giveCover(db, augDate.id);

    const before = dailyCovers(db, ctx, '2026-08');
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0]!;

    db.update(dates)
      .set({ deletedAt: 1 })
      .where(and(eq(dates.occurredOn, victim.occurredOn), eq(dates.coupleId, ctx.coupleId)))
      .run();

    expect(dailyCovers(db, ctx, '2026-08').map((r) => r.occurredOn)).not.toContain(
      victim.occurredOn,
    );
  });

  it('drops a day whose cover photo was deleted', () => {
    const { db, ctx } = seeded();
    const [augDate] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!augDate) throw new Error('fixture produced no August dates');
    giveCover(db, augDate.id);

    const before = dailyCovers(db, ctx, '2026-08');
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0]!;

    db.update(photos).set({ deletedAt: 1 }).where(isNull(photos.deletedAt)).run();

    expect(dailyCovers(db, ctx, '2026-08').map((r) => r.occurredOn)).not.toContain(
      victim.occurredOn,
    );
  });

  it('shows nothing from another couple', () => {
    const { db, ctx } = seeded();
    const [augDate] = datesInMonth(db, ctx.coupleId, '2026-08');
    if (!augDate) throw new Error('fixture produced no August dates');
    giveCover(db, augDate.id);

    const rows = dailyCovers(db, { coupleId: 'someone-else', currencyCode: ctx.currencyCode }, '2026-08');
    expect(rows).toEqual([]);
  });
});
