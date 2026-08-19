import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { onThisDay } from './onThisDay';

const TODAY = '2026-08-17';
const DEPS = testDeps(1_785_000_000_000, TODAY);

// Build dates directly rather than through captureStop, which always uses
// today — the whole point here is dates on other days in other years.
function seedDate(db: AppDatabase, coupleId: string, occurredOn: string, status = 'published') {
  const id = `d-${occurredOn}-${status}`;
  db.insert(dates).values({
    id, coupleId, occurredOn, status, createdBy: 'u', startedAt: 1, updatedAt: 1,
  }).run();
  return id;
}

describe('onThisDay', () => {
  it('finds the same day in an earlier year', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2025-08-17');

    expect(onThisDay(db, ctx, TODAY).map((d) => d.occurredOn)).toEqual(['2025-08-17']);
  });

  it('ignores the same date in a different month', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2025-07-17');

    expect(onThisDay(db, ctx, TODAY)).toEqual([]);
  });

  it('excludes today itself', () => {
    // Today's date is on the feed already; repeating it as a memory is noise.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, TODAY);

    expect(onThisDay(db, ctx, TODAY)).toEqual([]);
  });

  it('returns the most recent year first', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2023-08-17');
    seedDate(db, ctx.coupleId, '2025-08-17');

    expect(onThisDay(db, ctx, TODAY).map((d) => d.occurredOn))
      .toEqual(['2025-08-17', '2023-08-17']);
  });

  it('excludes drafts', () => {
    // A year-old draft is an abandoned capture, not a memory.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2025-08-17', 'draft');

    expect(onThisDay(db, ctx, TODAY)).toEqual([]);
  });

  it('excludes a tombstoned date', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const id = seedDate(db, ctx.coupleId, '2025-08-17');
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, id)).run();

    expect(onThisDay(db, ctx, TODAY)).toEqual([]);
  });

  it('shows nothing from another couple', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2025-08-17');

    const other = { coupleId: 'someone-else', currencyCode: ctx.currencyCode };
    expect(onThisDay(db, other, TODAY)).toEqual([]);
  });
});
