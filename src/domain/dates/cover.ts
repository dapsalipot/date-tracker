import { and, eq, isNull } from 'drizzle-orm';
import { dates, photos } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

/**
 * Validates ownership rather than trusting the caller. The composer picks from
 * a list already scoped to this date, so a mismatch means a stale screen raced
 * a delete — and a cover pointing at another date's photo would put the wrong
 * couple's evening on this card with nothing to explain it. Pass null to clear.
 */
export function setCoverPhoto(
  db: AppDatabase,
  deps: Deps,
  dateId: string,
  photoId: string | null,
): void {
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    if (photoId !== null) {
      const owned = tx
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.id, photoId), eq(photos.dateId, dateId), isNull(photos.deletedAt)))
        .all();

      if (owned.length === 0) {
        throw new Error(`photo ${photoId} does not belong to date ${dateId}`);
      }
    }

    tx.update(dates)
      .set({ coverPhotoId: photoId, updatedAt: now })
      .where(eq(dates.id, dateId))
      .run();
  });
}
