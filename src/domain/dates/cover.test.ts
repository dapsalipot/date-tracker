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

  it('clears the cover on a date that never had a photo', () => {
    const { db, dateId } = setup();

    // Clearing must not go through the ownership lookup: the composer offers
    // "no cover" for every date, including one whose only photo was just
    // removed. Requiring a photo to exist here would throw on the exact
    // screen the user reaches for to undo a cover they regret.
    expect(() => setCoverPhoto(db, DEPS, dateId, null)).not.toThrow();
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

  it("does not touch another date's cover when setting this one's", () => {
    const { db, ctx, dateId } = setup();
    const photoId = attachPhoto(db, DEPS, {
      dateId, localUri: 'file:///a.jpg', width: 4, height: 3,
    });

    // A second date, on a different day, with its own independent cover.
    const otherDay = testDeps(1_785_100_000_000, '2026-08-04', 'other2');
    const other = captureStop(db, otherDay, {
      coupleId: ctx.coupleId, userId: ctx.userId,
      kind: 'gift', amountMinor: 100, currencyCode: 'PHP',
    });
    const otherPhotoId = attachPhoto(db, otherDay, {
      dateId: other.dateId, localUri: 'file:///other.jpg', width: 4, height: 3,
    });
    db.update(dates).set({ coverPhotoId: otherPhotoId }).where(eq(dates.id, other.dateId)).run();

    setCoverPhoto(db, DEPS, dateId, photoId);

    // Unscoped, the UPDATE would stamp photoId onto every date row, including
    // this unrelated one.
    expect(coverOf(db, other.dateId)).toBe(otherPhotoId);
  });
});
