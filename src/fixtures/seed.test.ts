import { describe, expect, it, vi } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { listFeedDates } from '@/domain/dates/repository';
import { listDraftDates } from '@/domain/dates/drafts';
import { computeBudgetStatus } from '@/domain/budget/status';
import { listStopsForDate } from '@/domain/stops/edit';
import { budgets } from '@/db/schema';
import { seedTwelveMonths } from './seed';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03');

/**
 * Every test here seeds a full year, and better-sqlite3 is synchronous. Alone
 * each takes well under a second, but vitest runs test files in parallel worker
 * threads, so on a loaded machine these compete for a core — during a native
 * build they have measured over 16s. The work is genuinely this size, so the
 * budget is what gets raised, and file-wide rather than test-by-test: a per-test
 * timeout fixes whichever test lost the race that day and leaves its neighbours
 * to fail next time.
 */
vi.setConfig({ testTimeout: 30_000 });

describe('seedTwelveMonths', () => {
  it('creates a year of dates with stops and budgets', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const feed = listFeedDates(db, ctx);
    // Exactly 48: offsets step 7 days with at most 2 days of jitter, so every
    // generated day is distinct. A loose `>= 36` would let a future change
    // silently drop a quarter of the fixtures without failing.
    expect(feed).toHaveLength(48);
    expect(feed.every((d) => d.stopCount >= 2 && d.stopCount <= 4)).toBe(true);
    expect(feed.every((d) => d.totalMinor > 0)).toBe(true);
  });

  it('creates a budget for every month it seeded spend into', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const spentMonths = new Set(listFeedDates(db, ctx).map((d) => d.occurredOn.slice(0, 7)));
    const budgetedMonths = new Set(
      db.select().from(budgets).all().map((b) => b.periodMonth),
    );

    for (const month of spentMonths) {
      expect(budgetedMonths.has(month)).toBe(true);
    }
  });

  it('produces a budget for the current month', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    expect(computeBudgetStatus(db, ctx, AUG_3).budgetMinor).toBe(800000);
  });

  it('is deterministic', () => {
    const runOnce = () => {
      const db = createTestDb();
      const ctx = ensureLocalContext(db, AUG_3);
      seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);
      return listFeedDates(db, ctx).map((d) => d.totalMinor);
    };

    expect(runOnce()).toEqual(runOnce());
  });

  it('produces varied titles and published dates, not 48 identical drafts', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const scope = { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode };
    const all = listFeedDates(db, scope);
    expect(new Set(all.map((d) => d.title)).size).toBeGreaterThan(5);
    expect(all.filter((d) => d.status === 'published').length).toBeGreaterThan(40);
    expect(listDraftDates(db, scope)).toHaveLength(2);
  });

  it('spreads stop times so each date has a visible timeline', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const first = listFeedDates(db, { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode })[0];
    const times = listStopsForDate(db, first?.id ?? '').map((s) => s.occurredAt);
    expect(new Set(times).size).toBe(times.length);
  });
});
