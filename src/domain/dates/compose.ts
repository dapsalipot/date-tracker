import { and, eq, isNull } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface DateDetails {
  title?: string | null;
  caption?: string | null;
  rating?: number | null;
  coverPhotoId?: string | null;
  locationLabel?: string | null;
  /** ISO `YYYY-MM-DD`. Rejected if malformed or in the future. */
  occurredOn?: string;
}

export interface DateDetail {
  id: string;
  title: string | null;
  occurredOn: string;
  caption: string | null;
  rating: number | null;
  status: string;
  coverPhotoId: string | null;
}

export function dateDetailQuery(db: AppDatabase, dateId: string) {
  return db
    .select({
      id: dates.id,
      title: dates.title,
      occurredOn: dates.occurredOn,
      caption: dates.caption,
      rating: dates.rating,
      status: dates.status,
      coverPhotoId: dates.coverPhotoId,
    })
    .from(dates)
    .where(and(eq(dates.id, dateId), isNull(dates.deletedAt)));
}

export function loadDateDetail(db: AppDatabase, dateId: string): DateDetail | null {
  return dateDetailQuery(db, dateId).all()[0] ?? null;
}

/** Only the keys present in `details` are written, so partial edits are safe. */
export function updateDateDetails(
  db: AppDatabase,
  deps: Deps,
  dateId: string,
  details: DateDetails,
): void {
  const patch: Record<string, unknown> = { updatedAt: deps.clock.nowMs() };
  if (details.title !== undefined) patch.title = details.title;
  if (details.caption !== undefined) patch.caption = details.caption;
  if (details.rating !== undefined) patch.rating = details.rating;
  if (details.coverPhotoId !== undefined) patch.coverPhotoId = details.coverPhotoId;
  if (details.locationLabel !== undefined) patch.locationLabel = details.locationLabel;
  if (details.occurredOn !== undefined) {
    // Compared as a string everywhere — month grouping, the calendar grid and
    // every analytics read run substr over it — so a malformed value corrupts
    // all of them at once and silently.
    if (!ISO_DAY.test(details.occurredOn)) {
      throw new Error(`occurredOn must be YYYY-MM-DD, got: ${details.occurredOn}`);
    }
    // String comparison is correct for ISO days and needs no timezone.
    if (details.occurredOn > deps.clock.todayLocal()) {
      throw new Error('a date cannot have happened in the future');
    }
    patch.occurredOn = details.occurredOn;
  }

  db.update(dates).set(patch).where(eq(dates.id, dateId)).run();
}

/**
 * A draft is a date with money but no story. Publishing requires at least a
 * title — a published card's most prominent line is its title, and a feed of
 * "Untitled date" defeats the point of the whole wall.
 */
export function publishDate(db: AppDatabase, deps: Deps, dateId: string): void {
  const detail = loadDateDetail(db, dateId);
  if (!detail) throw new Error(`no such date: ${dateId}`);
  if (detail.title === null || detail.title.trim() === '') {
    throw new Error('a date needs a title before it can be published');
  }

  db.update(dates)
    .set({ status: 'published', updatedAt: deps.clock.nowMs() })
    .where(eq(dates.id, dateId))
    .run();
}

export function unpublishDate(db: AppDatabase, deps: Deps, dateId: string): void {
  db.update(dates)
    .set({ status: 'draft', updatedAt: deps.clock.nowMs() })
    .where(eq(dates.id, dateId))
    .run();
}
