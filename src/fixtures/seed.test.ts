import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { fixedClock } from '@/domain/clock';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { listFeedDates } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { seedTwelveMonths } from './seed';

const AUG_3 = fixedClock(1_785_000_000_000, '2026-08-03');

describe('seedTwelveMonths', () => {
  it('creates a year of dates with stops and budgets', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');

    const feed = listFeedDates(db, ctx.coupleId);
    expect(feed.length).toBeGreaterThanOrEqual(36);
    expect(feed.every((d) => d.stopCount >= 2)).toBe(true);
    expect(feed.every((d) => d.totalMinor > 0)).toBe(true);
  });

  it('produces a budget for the current month', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');

    expect(computeBudgetStatus(db, ctx.coupleId, AUG_3).budgetMinor).toBe(800000);
  });

  it('is deterministic', () => {
    const runOnce = () => {
      const db = createTestDb();
      const ctx = ensureLocalContext(db, AUG_3);
      seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');
      return listFeedDates(db, ctx.coupleId).map((d) => d.totalMinor);
    };

    expect(runOnce()).toEqual(runOnce());
  });
});
