import { eq } from 'drizzle-orm';
import { appSettings } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export const THEME_KEY = 'theme';

export function readSetting(db: AppDatabase, key: string): string | null {
  // ThemeProvider calls this on mount, which can land before migrations have
  // necessarily finished running (useMigrations's `success` flag starts
  // false and the app_settings table may not exist yet on that first
  // render). Treat "table not there yet" as "nothing saved yet" rather than
  // crashing — but only that specific failure; any other database error
  // still throws, since swallowing those could hide real corruption.
  let rows: { value: string }[];
  try {
    rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  } catch (err) {
    const isMissingTable =
      err instanceof Error && 'code' in err && err.code === 'SQLITE_ERROR' && err.message.includes('no such table');
    if (isMissingTable) return null;
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
