import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto, detachPhoto } from '@/domain/photos/repository';
import { setCoverPhoto } from './cover';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03', 'cov');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, ctx, dateId: captured.dateId };
}

function coverOf(db: ReturnType<typeof createTestDb>, dateId: string) {
  return db.select({ coverPhotoId: dates.coverPhotoId }).from(dates)
    .where(eq(dates.id, dateId)).all()[0]?.coverPhotoId;
}

describe('setCoverPhoto', () => {
  it('sets a photo belonging to the date as its cover', () => {
    const { db, dateId } = setup();
    const photoId = attachPhoto(db, DEPS, {
      dateId, localUri: 'file:///a.jpg', width: 4, height: 3,
    });

    setCoverPhoto(db, DEPS, dateId, photoId);

    expect(coverOf(db, dateId)).toBe(photoId);
  });

  it('refuses a photo belonging to a different date', () => {
    const { db, ctx, dateId } = setup();
    const otherDay = testDeps(1_785_100_000_000, '2026-08-04', 'other');
    const other = captureStop(db, otherDay, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'gift', amountMinor: 100, currencyCode: 'PHP',
    });
    const foreign = attachPhoto(db, otherDay, {
      dateId: other.dateId, localUri: 'file:///foreign.jpg', width: 4, height: 3,
    });

    expect(() => setCoverPhoto(db, DEPS, dateId, foreign)).toThrow(/does not belong/i);
    expect(coverOf(db, dateId)).toBeNull();
  });

  it('refuses a tombstoned photo', () => {
    const { db, dateId } = setup();
    const photoId = attachPhoto(db, DEPS, {
      dateId, localUri: 'file:///a.jpg', width: 4, height: 3,
    });
    detachPhoto(db, DEPS, photoId);

    expect(() => setCoverPhoto(db, DEPS, dateId, photoId)).toThrow(/does not belong/i);
  });

  it('clears the cover when given null', () => {
    const { db, dateId } = setup();
    const photoId = attachPhoto(db, DEPS, {
      dateId, localUri: 'file:///a.jpg', width: 4, height: 3,
    });
    setCoverPhoto(db, DEPS, dateId, photoId);

    setCoverPhoto(db, DEPS, dateId, null);

    expect(coverOf(db, dateId)).toBeNull();
  });

  it('bumps the date so the feed sees the new cover', () => {
    const { db, dateId } = setup();
    const photoId = attachPhoto(db, DEPS, {
      dateId, localUri: 'file:///a.jpg', width: 4, height: 3,
    });
    const updatedAtOf = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = updatedAtOf();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    setCoverPhoto(db, later, dateId, photoId);

    expect(updatedAtOf()).toBe(1_785_999_999_999);
    expect(updatedAtOf()).not.toBe(before);
  });
});
