import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { readSetting, writeSetting, THEME_KEY } from './settings';

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
});
