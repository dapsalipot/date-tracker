import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { milestones, type Milestone } from './milestones';

const TODAY = '2026-08-17';
const DEPS = testDeps(1_785_000_000_000, TODAY);

// Build dates (and their stops) directly, as onThisDay.test.ts does, so
// occurredOn and insertion order can be set independently of each other.
function seedDatedStops(
  db: AppDatabase,
  coupleId: string,
  occurredOn: string,
  amounts: number[],
  { status = 'published', currencyCode = 'PHP' } = {},
): string {
  const dateId = randomUUID();
  db.insert(dates).values({
    id: dateId, coupleId, occurredOn, status,
    createdBy: 'u', startedAt: 1, updatedAt: 1,
  }).run();

  amounts.forEach((amountMinor, i) => {
    db.insert(stops).values({
      id: randomUUID(), dateId, sortOrder: i, kind: 'food',
      amountMinor, currencyCode, updatedAt: 1,
    }).run();
  });

  return dateId;
}

const found = (all: Milestone[], kind: Milestone['kind']) => all.find((m) => m.kind === kind);

describe('milestones', () => {
  it('names the earliest published date as the first', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    // Seeded out of chronological order: the earliest is inserted last.
    seedDatedStops(db, ctx.coupleId, '2024-03-10', [100]);
    seedDatedStops(db, ctx.coupleId, '2024-02-20', [100]);
    seedDatedStops(db, ctx.coupleId, '2024-01-05', [100]);

    const all = milestones(db, ctx);
    expect(found(all, 'first')?.date.occurredOn).toBe('2024-01-05');
  });

  it('counts the tenth date by day, not by insertion order', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);

    // Newest day inserted first, so insertion order and day order disagree.
    const days = Array.from({ length: 10 }, (_, i) => `2024-01-${String(20 - i).padStart(2, '0')}`);
    const idByDay = new Map<string, string>();
    for (const day of days) {
      idByDay.set(day, seedDatedStops(db, ctx.coupleId, day, [100]));
    }
    const tenthByDay = [...days].sort()[9]!;

    const all = milestones(db, ctx);
    expect(found(all, 'nth')?.date.occurredOn).toBe(tenthByDay);
    expect(found(all, 'nth')?.date.id).toBe(idByDay.get(tenthByDay));
  });

  it('offers no tenth until there are ten dates', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    for (let i = 1; i <= 9; i += 1) {
      seedDatedStops(db, ctx.coupleId, `2024-01-${String(i).padStart(2, '0')}`, [100]);
    }

    const all = milestones(db, ctx);
    expect(found(all, 'nth')).toBeUndefined();
  });

  it('picks the highest single-date total as priciest', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDatedStops(db, ctx.coupleId, '2024-01-01', [1000]);
    const expensiveDateId = seedDatedStops(db, ctx.coupleId, '2024-01-02', [5000]);
    seedDatedStops(db, ctx.coupleId, '2024-01-03', [2000]);

    const all = milestones(db, ctx);
    expect(found(all, 'priciest')?.date.id).toBe(expensiveDateId);
  });

  it('ignores another currency when picking the priciest', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDatedStops(db, ctx.coupleId, '2024-01-01', [900000], { currencyCode: 'JPY' });
    const phpDateId = seedDatedStops(db, ctx.coupleId, '2024-01-02', [5000], { currencyCode: 'PHP' });

    const all = milestones(db, { coupleId: ctx.coupleId, currencyCode: 'PHP' });
    expect(found(all, 'priciest')?.date.id).toBe(phpDateId);
  });

  it('breaks a tie on longest to the earlier date', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const earlierId = seedDatedStops(db, ctx.coupleId, '2024-01-01', [100, 200, 300]);
    seedDatedStops(db, ctx.coupleId, '2024-01-05', [100, 200, 300]);

    const all = milestones(db, ctx);
    expect(found(all, 'longest')?.date.occurredOn).toBe('2024-01-01');
    expect(found(all, 'longest')?.date.id).toBe(earlierId);
  });

  it('shows nothing from another couple', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDatedStops(db, ctx.coupleId, '2024-01-01', [100]);

    const other = { coupleId: 'someone-else', currencyCode: ctx.currencyCode };
    expect(milestones(db, other)).toEqual([]);
  });

  it('excludes a draft even when it would otherwise win a milestone', () => {
    // Earliest by day, but a draft: it would take 'first' if status weren't
    // filtered. Mirrors onThisDay.test.ts's "excludes drafts" case.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDatedStops(db, ctx.coupleId, '2024-01-01', [100], { status: 'draft' });
    const earliestPublishedId = seedDatedStops(db, ctx.coupleId, '2024-02-01', [100]);
    seedDatedStops(db, ctx.coupleId, '2024-03-01', [100]);

    const all = milestones(db, ctx);
    expect(found(all, 'first')?.date.occurredOn).toBe('2024-02-01');
    expect(found(all, 'first')?.date.id).toBe(earliestPublishedId);
  });

  it('excludes a tombstoned date even when it would otherwise win a milestone', () => {
    // Earliest by day, but soft-deleted: it would take 'first' if
    // feedDateSelection's deletedAt filter weren't applied. Mirrors
    // favourites.test.ts's "excludes drafts and tombstoned dates" case.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const tombstonedId = seedDatedStops(db, ctx.coupleId, '2024-01-01', [100]);
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, tombstonedId)).run();
    const earliestLiveId = seedDatedStops(db, ctx.coupleId, '2024-02-01', [100]);
    seedDatedStops(db, ctx.coupleId, '2024-03-01', [100]);

    const all = milestones(db, ctx);
    expect(found(all, 'first')?.date.occurredOn).toBe('2024-02-01');
    expect(found(all, 'first')?.date.id).toBe(earliestLiveId);
  });
});
