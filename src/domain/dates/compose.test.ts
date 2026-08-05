import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { dates } from '@/db/schema';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { loadDateDetail, publishDate, unpublishDate, updateDateDetails } from './compose';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, dateId: captured.dateId };
}

describe('updateDateDetails', () => {
  it('sets the fields it is given and leaves the rest alone', () => {
    const { db, dateId } = setup();

    updateDateDetails(db, DEPS, dateId, { title: 'Bag of Beans Day' });
    updateDateDetails(db, DEPS, dateId, { rating: 5 });

    const detail = loadDateDetail(db, dateId);
    expect(detail?.title).toBe('Bag of Beans Day');
    expect(detail?.rating).toBe(5);
  });

  it('bumps updated_at so sync and draft ordering see the edit', () => {
    const { db, dateId } = setup();
    const updatedAtOf = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = updatedAtOf();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    updateDateDetails(db, later, dateId, { caption: 'worth the rain' });

    expect(loadDateDetail(db, dateId)?.caption).toBe('worth the rain');
    expect(updatedAtOf()).toBe(1_785_999_999_999);
    expect(updatedAtOf()).not.toBe(before);
  });
});

describe('loadDateDetail', () => {
  it('does not load a tombstoned date', () => {
    const { db, dateId } = setup();
    db.update(dates).set({ deletedAt: 1_785_000_000_000 }).where(eq(dates.id, dateId)).run();

    expect(loadDateDetail(db, dateId)).toBeNull();
  });
});

describe('publishDate', () => {
  it('refuses to publish an untitled date', () => {
    const { db, dateId } = setup();

    expect(() => publishDate(db, DEPS, dateId)).toThrow(/title/i);
    expect(loadDateDetail(db, dateId)?.status).toBe('draft');
  });

  it('publishes once a title exists', () => {
    const { db, dateId } = setup();
    updateDateDetails(db, DEPS, dateId, { title: 'Tagaytay' });

    publishDate(db, DEPS, dateId);

    expect(loadDateDetail(db, dateId)?.status).toBe('published');
  });

  it('can be reversed', () => {
    const { db, dateId } = setup();
    updateDateDetails(db, DEPS, dateId, { title: 'Tagaytay' });
    publishDate(db, DEPS, dateId);

    unpublishDate(db, DEPS, dateId);

    expect(loadDateDetail(db, dateId)?.status).toBe('draft');
  });
});
