import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import type { FeedDate } from '@/domain/dates/repository';
import { favourites, FAVOURITE_THRESHOLD } from './favourites';

const TODAY = '2026-08-17';
const DEPS = testDeps(1_785_000_000_000, TODAY);

// Mirrors onThisDay.test.ts's seedDate, plus the rating this read model
// actually filters on.
function seedDate(
  db: AppDatabase,
  coupleId: string,
  occurredOn: string,
  { status = 'published', rating = null as number | null } = {},
): string {
  const id = `d-${occurredOn}-${status}-${rating ?? 'null'}`;
  db.insert(dates).values({
    id, coupleId, occurredOn, status, rating, createdBy: 'u', startedAt: 1, updatedAt: 1,
  }).run();
  return id;
}

const ids = (all: FeedDate[]) => all.map((d) => d.id);

describe('favourites', () => {
  it('includes a date rated at the threshold', () => {
    // 4 is in, not out. An off-by-one here silently hides a favourite.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const ratedFour = seedDate(db, ctx.coupleId, '2026-08-10', { rating: FAVOURITE_THRESHOLD });

    expect(ids(favourites(db, ctx))).toContain(ratedFour);
  });

  it('excludes a date rated below the threshold', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const ratedThree = seedDate(db, ctx.coupleId, '2026-08-10', { rating: FAVOURITE_THRESHOLD - 1 });

    expect(ids(favourites(db, ctx))).not.toContain(ratedThree);
  });

  it('excludes an unrated date', () => {
    // rating is null for every date until someone rates it, and null must not
    // compare as greater than anything.
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const unrated = seedDate(db, ctx.coupleId, '2026-08-10');

    expect(ids(favourites(db, ctx))).not.toContain(unrated);
  });

  it('returns the newest first', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2026-07-01', { rating: 5 });
    seedDate(db, ctx.coupleId, '2026-08-10', { rating: 4 });

    expect(favourites(db, ctx).map((d) => d.occurredOn)).toEqual(['2026-08-10', '2026-07-01']);
  });

  it('excludes drafts and tombstoned dates', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const draftButRated = seedDate(db, ctx.coupleId, '2026-08-05', { status: 'draft', rating: 5 });
    const deletedButRated = seedDate(db, ctx.coupleId, '2026-08-06', { rating: 5 });
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, deletedButRated)).run();

    expect(ids(favourites(db, ctx))).not.toContain(draftButRated);
    expect(ids(favourites(db, ctx))).not.toContain(deletedButRated);
  });

  it('shows nothing from another couple', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    seedDate(db, ctx.coupleId, '2026-08-10', { rating: 5 });

    expect(favourites(db, { coupleId: 'someone-else', currencyCode: 'PHP' })).toEqual([]);
  });
});
