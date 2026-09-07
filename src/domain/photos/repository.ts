import { and, asc, eq, isNull } from 'drizzle-orm';
import { dates, photos } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface AttachPhotoInput {
  dateId: string;
  stopId?: string | null;
  localUri: string;
  width: number;
  height: number;
  takenAt?: number | null;
}

export interface PhotoRow {
  id: string;
  stopId: string | null;
  localUri: string | null;
  width: number;
  height: number;
  takenAt: number | null;
}

/**
 * v1 has no network, so a photo never leaves `upload_state: 'local'`. The
 * remote_key/thumb_key columns and the local -> uploading -> synced lifecycle
 * exist for v2, where only a compressed display copy is uploaded and the
 * original stays on the device that took it.
 */
export function attachPhoto(db: AppDatabase, deps: Deps, input: AttachPhotoInput): string {
  const now = deps.clock.nowMs();
  const id = deps.newId();

  db.insert(photos)
    .values({
      id,
      dateId: input.dateId,
      stopId: input.stopId ?? null,
      localUri: input.localUri,
      width: input.width,
      height: input.height,
      takenAt: input.takenAt ?? now,
      uploadState: 'local',
      updatedAt: now,
    })
    .run();

  return id;
}

/** Unexecuted builder so screens can subscribe with useLiveQuery. */
export function photosForDateQuery(db: AppDatabase, dateId: string) {
  return db
    .select({
      id: photos.id,
      stopId: photos.stopId,
      localUri: photos.localUri,
      width: photos.width,
      height: photos.height,
      takenAt: photos.takenAt,
    })
    .from(photos)
    .where(and(eq(photos.dateId, dateId), isNull(photos.deletedAt)))
    .orderBy(asc(photos.takenAt));
}

/**
 * The screens all subscribe to `photosForDateQuery` instead, so a search for
 * callers finds only tests and this looks like dead code. It is not: it is how
 * `attachPhoto` and `detachPhoto` — both live — are asserted, and deleting it
 * deletes their coverage. Left deliberately.
 */
export function listPhotosForDate(db: AppDatabase, dateId: string): PhotoRow[] {
  return photosForDateQuery(db, dateId).all();
}

export function detachPhoto(db: AppDatabase, deps: Deps, photoId: string): void {
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    tx.update(photos)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(photos.id, photoId))
      .run();

    // Tombstones do not cascade, so a date could otherwise keep pointing at a
    // photo the user just deleted. Scoped by cover_photo_id, this is a no-op
    // for the common case of detaching a photo that was never the cover.
    tx.update(dates)
      .set({ coverPhotoId: null, updatedAt: now })
      .where(eq(dates.coverPhotoId, photoId))
      .run();
  });
}
