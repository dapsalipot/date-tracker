import { describe, expect, it } from 'vitest';
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
  });
});
