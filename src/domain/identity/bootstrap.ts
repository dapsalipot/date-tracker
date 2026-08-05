import { coupleMembers, couples, users } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface LocalContext {
  userId: string;
  coupleId: string;
  currencyCode: string;
  timezone: string;
}

const DEFAULT_CURRENCY = 'PHP';
const DEFAULT_TIMEZONE = 'Asia/Manila';

/**
 * v1 has no authentication. On first launch we create one user, one couple, and
 * one membership joining them. Every write is couple-scoped exactly as it will
 * be in v2 — the only difference is that the membership has one row, not two.
 */
export function ensureLocalContext(db: AppDatabase, deps: Deps): LocalContext {
  const existing = db.select().from(coupleMembers).limit(1).all();
  const first = existing[0];

  if (first) {
    const couple = db.select().from(couples).all().find((c) => c.id === first.coupleId);
    return {
      userId: first.userId,
      coupleId: first.coupleId,
      currencyCode: couple?.currencyCode ?? DEFAULT_CURRENCY,
      timezone: couple?.timezone ?? DEFAULT_TIMEZONE,
    };
  }

  const now = deps.clock.nowMs();
  const userId = deps.newId();
  const coupleId = deps.newId();

  db.insert(users).values({ id: userId, displayName: 'Me', updatedAt: now }).run();
  db.insert(couples)
    .values({
      id: coupleId,
      currencyCode: DEFAULT_CURRENCY,
      timezone: DEFAULT_TIMEZONE,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(coupleMembers).values({ coupleId, userId, joinedAt: now, updatedAt: now }).run();

  return { userId, coupleId, currencyCode: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE };
}
