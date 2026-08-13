import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { dates, photos } from '@/db/schema';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto, detachPhoto, listPhotosForDate } from './repository';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, ...captured };
}

describe('attachPhoto', () => {
  it('attaches a photo to a date at upload_state local', () => {
    const { db, dateId } = setup();

    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1600, height: 1200 });

    const photos = listPhotosForDate(db, dateId);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.id).toBe(id);
    expect(photos[0]?.localUri).toBe('file:///a.jpg');
    expect(photos[0]?.stopId).toBeNull();
  });

  it('can attach a photo to a specific stop', () => {
    const { db, dateId, stopId } = setup();

    attachPhoto(db, DEPS, { dateId, stopId, localUri: 'file:///b.jpg', width: 100, height: 100 });

    expect(listPhotosForDate(db, dateId)[0]?.stopId).toBe(stopId);
  });

  it('returns photos in capture order', () => {
    const { db, dateId } = setup();

    attachPhoto(db, DEPS, { dateId, localUri: 'file:///1.jpg', width: 1, height: 1, takenAt: 200 });
    attachPhoto(db, DEPS, { dateId, localUri: 'file:///2.jpg', width: 1, height: 1, takenAt: 100 });

    expect(listPhotosForDate(db, dateId).map((p) => p.localUri)).toEqual([
      'file:///2.jpg',
      'file:///1.jpg',
    ]);
  });
});

describe('detachPhoto', () => {
  it('tombstones rather than hard-deleting', () => {
    const { db, dateId } = setup();
    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1, height: 1 });

    detachPhoto(db, DEPS, id);

    expect(listPhotosForDate(db, dateId)).toHaveLength(0);

    // The row must still be there. Asserting only that it left the filtered
    // list is satisfied just as well by a hard delete, which would destroy
    // the row v2's sync needs in order to propagate the deletion.
    const raw = db
      .select({ id: photos.id, deletedAt: photos.deletedAt })
      .from(photos)
      .where(eq(photos.id, id))
      .all();
    expect(raw).toHaveLength(1);
    expect(raw[0]?.deletedAt).toBe(1_785_000_000_000);
  });

  it('clears the cover it was serving when detached', () => {
    const { db, dateId } = setup();
    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1, height: 1 });
    db.update(dates).set({ coverPhotoId: id }).where(eq(dates.id, dateId)).run();

    detachPhoto(db, DEPS, id);

    // A dangling cover_photo_id would render an empty card with no way for the
    // user to understand why, and there is no foreign-key cascade for a tombstone.
    const cover = db.select({ coverPhotoId: dates.coverPhotoId }).from(dates)
      .where(eq(dates.id, dateId)).all()[0]?.coverPhotoId;
    expect(cover).toBeNull();
  });

  it("does not clear another date's cover when detaching this one's", () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);

    const dateA = captureStop(db, DEPS, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1000, currencyCode: 'PHP',
    });
    const photoA = attachPhoto(db, DEPS, {
      dateId: dateA.dateId, localUri: 'file:///a.jpg', width: 1, height: 1,
    });
    db.update(dates).set({ coverPhotoId: photoA }).where(eq(dates.id, dateA.dateId)).run();

    // A second date, on a different day, with its own independent cover.
    const otherDay = testDeps(1_785_100_000_000, '2026-08-04', 'other');
    const dateB = captureStop(db, otherDay, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'gift', amountMinor: 2000, currencyCode: 'PHP',
    });
    const photoB = attachPhoto(db, otherDay, {
      dateId: dateB.dateId, localUri: 'file:///b.jpg', width: 1, height: 1,
    });
    db.update(dates).set({ coverPhotoId: photoB }).where(eq(dates.id, dateB.dateId)).run();

    detachPhoto(db, DEPS, photoA);

    const coverOf = (dateId: string) =>
      db.select({ coverPhotoId: dates.coverPhotoId }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.coverPhotoId;

    expect(coverOf(dateA.dateId)).toBeNull();
    // Unscoped, the UPDATE would clear every date's cover, not just the one
    // that pointed at the detached photo.
    expect(coverOf(dateB.dateId)).toBe(photoB);
  });

  it('bumps the date so the feed sees the cover clear', () => {
    const { db, dateId } = setup();
    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1, height: 1 });
    db.update(dates).set({ coverPhotoId: id }).where(eq(dates.id, dateId)).run();
    const dateUpdatedAt = () =>
      db.select({ updatedAt: dates.updatedAt }).from(dates)
        .where(eq(dates.id, dateId)).all()[0]?.updatedAt;
    const before = dateUpdatedAt();

    const later = testDeps(1_785_999_999_999, '2026-08-03', 'later');
    detachPhoto(db, later, id);

    expect(dateUpdatedAt()).toBe(1_785_999_999_999);
    expect(dateUpdatedAt()).not.toBe(before);
  });
});
