import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { createTestDb, testDeps } from '@/test/testDb';
import { isMissingTableError, readSetting, writeSetting, THEME_KEY } from './settings';

const DEPS = testDeps(1_785_000_000_000, '2026-08-19');

describe('settings', () => {
  it('returns null for a key never written', () => {
    expect(readSetting(createTestDb(), THEME_KEY)).toBeNull();
  });

  it('reads back what it wrote', () => {
    const db = createTestDb();
    writeSetting(db, DEPS, THEME_KEY, 'dark');
    expect(readSetting(db, THEME_KEY)).toBe('dark');
  });

  it('overwrites rather than accumulating rows', () => {
    // Without the upsert this throws on the primary key, and a toggle would
    // work exactly once per install.
    const db = createTestDb();
    writeSetting(db, DEPS, THEME_KEY, 'dark');
    writeSetting(db, DEPS, THEME_KEY, 'light');
    expect(readSetting(db, THEME_KEY)).toBe('light');
  });

  it('keeps unrelated keys independent', () => {
    const db = createTestDb();
    writeSetting(db, DEPS, THEME_KEY, 'dark');
    writeSetting(db, DEPS, 'other', 'x');
    expect(readSetting(db, THEME_KEY)).toBe('dark');
  });

  it('returns null rather than throwing when app_settings does not exist yet', () => {
    // No migrate() call: the table genuinely is not there, reproducing what
    // ThemeProvider hits reading the theme before useMigrations resolves.
    // This uses better-sqlite3, the test driver — it proves the end-to-end
    // path on that driver, but nothing about the shipped expo-sqlite driver,
    // which reports a different `code` for the same failure. See the
    // `isMissingTableError` tests below for that.
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite, { schema }) as unknown as AppDatabase;
    expect(() => readSetting(db, THEME_KEY)).not.toThrow();
    expect(readSetting(db, THEME_KEY)).toBeNull();
  });
});

describe('isMissingTableError', () => {
  it('recognises expo-sqlite\'s missing-table error, even though its code differs from better-sqlite3\'s', () => {
    // expo-sqlite (the driver the app actually ships on) reports
    // ERR_INTERNAL_SQLITE_ERROR, not better-sqlite3's SQLITE_ERROR. A check
    // that keyed off `code` would miss this and rethrow, bricking the app on
    // first launch before migrations create app_settings.
    const expoShaped = Object.assign(new Error('no such table: app_settings'), {
      code: 'ERR_INTERNAL_SQLITE_ERROR',
    });
    expect(isMissingTableError(expoShaped)).toBe(true);
  });

  it('does not swallow a genuine database error with a different message', () => {
    const syntaxError = Object.assign(new Error('near "SELCT": syntax error'), {
      code: 'ERR_INTERNAL_SQLITE_ERROR',
    });
    expect(isMissingTableError(syntaxError)).toBe(false);
  });
});
