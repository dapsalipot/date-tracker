import { eq } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export const THEME_KEY = 'theme';

/**
 * "Table not there yet" looks different depending on the driver — better-
 * sqlite3 (the test driver) sets `err.code === 'SQLITE_ERROR'`, while
 * expo-sqlite (what actually ships) sets `err.code === 'ERR_INTERNAL_SQLITE_ERROR'`.
 * The message is the one thing both agree on, so match on that instead of
 * `code`. Narrow on purpose: any other database error must still throw,
 * since swallowing those could hide real corruption.
 */
export function isMissingTableError(err: unknown): boolean {
  return err instanceof Error && /no such table/i.test(err.message);
}

export function readSetting(db: AppDatabase, key: string): string | null {
  // ThemeProvider calls this on mount, which can land before migrations have
  // necessarily finished running (useMigrations's `success` flag starts
  // false and the app_settings table may not exist yet on that first
  // render). Treat "table not there yet" as "nothing saved yet" rather than
  // crashing.
  let rows: { value: string }[];
  try {
    rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
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
