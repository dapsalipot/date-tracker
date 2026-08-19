import { eq } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export const THEME_KEY = 'theme';

export function readSetting(db: AppDatabase, key: string): string | null {
  const rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  return rows[0]?.value ?? null;
}

export function writeSetting(db: AppDatabase, deps: Deps, key: string, value: string): void {
  const now = deps.clock.nowMs();
  // Upsert, not insert: the key is the primary key, so a second write of the
  // same setting would otherwise throw and the toggle would work once.
  db.insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } })
    .run();
}
