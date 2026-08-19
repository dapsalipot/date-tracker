# Keepsake UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat charcoal UI with a warm, photo-forward keepsake: a real typeface, two complete themes with a toggle, matted cards, a calendar of the couple's own photos, and a feed with rhythm.

**Architecture:** `theme.ts` splits into two full theme objects behind a React context, so every component reads the *active* theme instead of a module-level constant. Contrast is a tested pure function over the tokens, not a convention. The calendar and feed gain one new query each; everything else re-uses data already on `FeedDate`.

**Tech Stack:** React Native, Expo SDK 57, expo-router, expo-font (Nunito), drizzle-orm over expo-sqlite / better-sqlite3, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-keepsake-ui-design.md`

## Global Constraints

- `src/domain/**` must not import react, react-native or expo. Themes are UI.
- No component may contain a raw hex colour. Every colour comes from the active theme.
- Light and dark expose **identical** token keys; a missing key is a test failure, not a runtime fallback.
- Kind colours **outline** chips and **fill** bars, never the reverse.
- Every `ink`/`inkMuted` on `ground` or `surface` ≥ 4.5:1. `onPrimary` on `primary` ≥ 4.5:1. `primary` on `ground` ≥ 3:1. Every kind colour on its `surface` ≥ 4.5:1.
- Dark mode has **no** shadow. Light mode's lift is `shadowColor '#3A2A18'`, offset `{0,2}`, radius 8, opacity 0.12, elevation 2.
- Fonts: Nunito weights 400/600/700/800 only.
- Radii: `sm 8 · md 12 · lg 18 · xl 24`.
- Never run `npm run lint` — no ESLint config is committed and it rewrites `package.json`.
- Type scale: display 34/38/800, title 22/28/800, body 16/24/400, meta 13/18/600, micro 11/14/700 +1.5 tracking.

---

### Task 1: Contrast as a tested function

**Files:**
- Create: `src/ui/contrast.ts`
- Test: `src/ui/contrast.test.ts`

**Interfaces:**
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrastRatio', () => {
  it('gives black on white the maximum 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('gives a colour against itself 1:1', () => {
    expect(contrastRatio('#A61B34', '#A61B34')).toBeCloseTo(1, 6);
  });

  it('does not care which argument is lighter', () => {
    expect(contrastRatio('#A61B34', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#A61B34'),
      6,
    );
  });

  it('matches known WCAG values', () => {
    // Verified against the published formula; these anchor the implementation
    // so a refactor cannot quietly change what "passes AA" means.
    expect(contrastRatio('#FFFFFF', '#A61B34')).toBeCloseTo(7.4, 1);
    expect(contrastRatio('#2A2018', '#EFE4D4')).toBeCloseTo(12.7, 1);
  });

  it('applies the sRGB gamma curve, not a linear ramp', () => {
    // Mid grey is perceptually half but linearly ~0.216. A naive implementation
    // that skips the transfer function returns 0.5 here and every threshold
    // in the theme test silently shifts.
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('reads all three channels', () => {
    // Green dominates luminance; a bug that reads only the red channel makes
    // pure green and pure red measure the same.
    expect(relativeLuminance('#00FF00')).toBeGreaterThan(relativeLuminance('#FF0000'));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/contrast.test.ts`
Expected: FAIL — `Cannot find module './contrast'`

- [ ] **Step 3: Implement**

```ts
/**
 * WCAG relative luminance. The gamma step is not decoration: sRGB values are
 * perceptually encoded, and skipping the transfer function shifts every ratio
 * enough to turn a failing colour into a passing one.
 */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Ratio between two colours, 1:1 to 21:1. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/contrast.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/ui/contrast.ts src/ui/contrast.test.ts
git commit -m "feat: add a WCAG contrast function for the theme guards"
```

---

### Task 2: Two themes, guarded

**Files:**
- Create: `src/ui/themes.ts`
- Modify: `src/ui/theme.ts` (reduce to shared, theme-independent tokens)
- Modify: `src/ui/theme.test.ts` (extend with the new guards)

**Interfaces:**
- Consumes: `contrastRatio` from Task 1.
- Produces: `lightTheme`, `darkTheme`, `type Theme`, `type ThemeName = 'light' | 'dark'`, `themes: Record<ThemeName, Theme>`. `theme` keeps exporting the shared `type`/`space`/`radius`/`motion`/`screenMargin` tokens.

- [ ] **Step 1: Write the failing test** — append to `src/ui/theme.test.ts`

```ts
import { contrastRatio } from './contrast';
import { darkTheme, lightTheme, themes, type Theme } from './themes';

const AA_TEXT = 4.5;
const AA_LARGE = 3;

function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix === '' ? k : `${prefix}.${k}`))
    .sort();
}

describe('themes', () => {
  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps body text legible on both ground and surface',
    (_name, t: Theme) => {
      for (const ink of [t.role.ink, t.role.inkMuted]) {
        expect(contrastRatio(ink, t.role.ground)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(ink, t.role.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s can put a label on its primary button',
    (_name, t: Theme) => {
      expect(contrastRatio(t.role.onPrimary, t.role.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s shows its accent against the ground',
    (_name, t: Theme) => {
      expect(contrastRatio(t.role.primary, t.role.ground)).toBeGreaterThanOrEqual(AA_LARGE);
    },
  );

  it.each([['light', lightTheme], ['dark', darkTheme]] as const)(
    '%s keeps every kind readable as chip text',
    (_name, t: Theme) => {
      // 4.5 and not 3, because a kind colour renders as an 11pt chip LABEL,
      // not merely as a bar fill. The first gold tried here, #B07A12, measured
      // 3.41:1 and was unreadable.
      for (const k of STOP_KINDS) {
        expect(contrastRatio(t.kind[k], t.role.surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it('gives both themes identical shapes', () => {
    // A key present in one theme and missing from the other is a crash on
    // whichever screen reads it, on whichever theme the user happens to pick.
    expect(keyPaths(darkTheme)).toEqual(keyPaths(lightTheme));
  });

  it('covers every stop kind in both themes', () => {
    for (const t of [lightTheme, darkTheme]) {
      for (const k of STOP_KINDS) expect(t.kind[k]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('lifts cards in light and refuses to in dark', () => {
    // A shadow on a near-black ground is invisible, and a glow standing in for
    // one looks like a rendering bug. Depth in dark comes from surface + line.
    expect(lightTheme.lift).not.toBeNull();
    expect(darkTheme.lift).toBeNull();
  });

  it('is reachable by name', () => {
    expect(themes.light).toBe(lightTheme);
    expect(themes.dark).toBe(darkTheme);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL — `Cannot find module './themes'`

- [ ] **Step 3: Create `src/ui/themes.ts`**

```ts
import type { StopKind } from '@/domain/stops/taxonomy';

export type ThemeName = 'light' | 'dark';

export interface Lift {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Theme {
  name: ThemeName;
  role: {
    ground: string;
    surface: string;
    surfaceSunk: string;
    line: string;
    ink: string;
    inkMuted: string;
    primary: string;
    onPrimary: string;
  };
  kind: Record<StopKind, string>;
  /** Null in dark on purpose — see the theme test. */
  lift: Lift | null;
}

/** Aged paper. Ratios in the spec are computed, not estimated. */
export const lightTheme: Theme = {
  name: 'light',
  role: {
    ground: '#EFE4D4',
    surface: '#FBF4EA',
    surfaceSunk: '#F5EBDC',
    line: '#E0CFB4',
    ink: '#2A2018',
    inkMuted: '#6B5A47',
    primary: '#A61B34',
    onPrimary: '#FFFFFF',
  },
  kind: {
    food: '#8A5E0A',
    transport: '#2F7D4F',
    activity: '#17706B',
    shopping: '#2A5DA8',
    gift: '#7A3FA8',
    other: '#6B5A47',
  },
  lift: {
    shadowColor: '#3A2A18',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
};

/**
 * Night, warmed off pure slate. The accent inverts to coral because crimson on
 * this ground measures under 3:1 and cannot carry a filled button.
 */
export const darkTheme: Theme = {
  name: 'dark',
  role: {
    ground: '#121420',
    surface: '#1E2130',
    surfaceSunk: '#181B27',
    line: '#2C3040',
    ink: '#EFEDF5',
    inkMuted: '#9A9AAE',
    primary: '#FF8A5C',
    onPrimary: '#1A1206',
  },
  kind: {
    food: '#F5C242',
    transport: '#6BD97F',
    activity: '#3DD6C4',
    shopping: '#5B9DFF',
    gift: '#C77DFF',
    other: '#9A9AAE',
  },
  lift: null,
};

export const themes: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme };
```

- [ ] **Step 4: Reduce `src/ui/theme.ts` to shared tokens**

Delete the `role`, `kind` and legacy `color` blocks entirely. `color` (rose/cream/blush/gold) is dead — nothing reads it. Keep only:

```ts
const type = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: 0, fontWeight: '800' as const },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontWeight: '800' as const },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0, fontWeight: '400' as const },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontWeight: '600' as const },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontWeight: '700' as const },
} as const;

const motion = { fast: 120, base: 220 } as const;

export const theme = {
  type,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 8, md: 12, lg: 18, xl: 24 },
  screenMargin: 20,
} as const;
```

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: the new theme tests PASS. Components still referencing `theme.role`/`theme.kind` now fail `tsc` — that is expected and Task 4 fixes them. Do not patch components here.

- [ ] **Step 6: Commit**

```bash
git add src/ui/themes.ts src/ui/theme.ts src/ui/theme.test.ts
git commit -m "feat: split the palette into guarded light and dark themes"
```

---

### Task 3: Persisting the chosen theme

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/domain/settings/settings.ts`
- Test: `src/domain/settings/settings.test.ts`
- Generate: a new migration in `drizzle/`

**Interfaces:**
- Produces: `readSetting(db, key): string | null`, `writeSetting(db, deps, key, value): void`, `THEME_KEY = 'theme'`

- [ ] **Step 1: Add the table to `src/db/schema.ts`**

```ts
/**
 * Local UI preferences. Deliberately not couple-scoped and not synced: which
 * theme this phone shows is a property of the device, not of the relationship.
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new file appears in `drizzle/`. Tests apply it automatically — `createTestDb` runs `migrate(db, { migrationsFolder: './drizzle' })`.

- [ ] **Step 3: Write the failing test**

```ts
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
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run src/domain/settings/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`

- [ ] **Step 5: Implement**

```ts
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
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npx vitest run src/domain/settings/settings.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/domain/settings drizzle
git commit -m "feat: persist local UI settings in the database"
```

---

### Task 4: Theme context, and every component onto it

**Files:**
- Create: `src/ui/ThemeProvider.tsx`
- Modify: `app/_layout.tsx`
- Modify: all 12 files that import `ui/theme` and read `theme.role` or `theme.kind`

**Interfaces:**
- Consumes: `themes`, `Theme`, `ThemeName` (Task 2); `readSetting`, `writeSetting`, `THEME_KEY` (Task 3).
- Produces: `<ThemeProvider>`, `useTheme(): Theme`, `useThemeToggle(): () => void`

- [ ] **Step 1: Create the provider**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { db } from '@/db/client';
import { getAppDeps } from '@/session';
import { readSetting, writeSetting, THEME_KEY } from '@/domain/settings/settings';
import { themes, type Theme, type ThemeName } from './themes';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

function storedName(): ThemeName {
  // Anything unrecognised falls back rather than crashing: the column is free
  // text, and a bad value must not brick the app on launch.
  return readSetting(db, THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName>(storedName);

  const toggle = useCallback(() => {
    setName((current) => {
      const next: ThemeName = current === 'light' ? 'dark' : 'light';
      writeSetting(db, getAppDeps(), THEME_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme: themes[name], toggle }), [name, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme called outside ThemeProvider');
  return ctx.theme;
}

export function useThemeToggle(): () => void {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useThemeToggle called outside ThemeProvider');
  return ctx.toggle;
}
```

- [ ] **Step 2: Wrap the app in `app/_layout.tsx`**

Wrap the existing root `<Stack>` in `<ThemeProvider>`. It must sit *inside* whatever bootstraps the local context (the provider reads the database on mount) and *outside* the navigator.

- [ ] **Step 3: Migrate every component**

For each file that referenced `theme.role.*` or `theme.kind.*`, add `const t = useTheme();` at the top of the component and replace `theme.role.x` → `t.role.x`, `theme.kind[k]` → `t.kind[k]`. Leave `theme.space`, `theme.type`, `theme.radius`, `theme.motion` untouched — those are shared and still come from `theme`.

Files: `Card.tsx`, `Button.tsx`, `Bar.tsx`, `KindChips.tsx`, `SubkindChips.tsx`, `KindIcon.tsx`, `MicroLabel.tsx`, `PayerPicker.tsx`, `ReceiptReview.tsx`, `Ring.tsx`, `Rule.tsx`, `Screen.tsx`, `CalendarGrid.tsx`, plus screens under `app/`.

Two that need care:
- **`Ring.tsx`** takes `tintOf` as a prop, so it needs no theme access for arcs; only its container does.
- **`src/render/receipt/*`** is out of scope. It has its own visual language and must keep using fixed colours — a shared receipt should not change appearance with the sender's theme.

- [ ] **Step 4: Add the toggle control**

In the Spending screen header, next to the month stepper, add a Pressable calling `useThemeToggle()` showing `Ionicons name={t.name === 'light' ? 'moon-outline' : 'sunny-outline'}`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` exit 0 — no file references `theme.role` or `theme.kind` any more. Confirm with:

Run: `grep -rn "theme\.role\|theme\.kind" src app | grep -v render/receipt`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: read colour from an active theme rather than a constant"
```

---

### Task 5: Nunito

**Files:**
- Modify: `package.json`, `app/_layout.tsx`

- [ ] **Step 1: Install**

```bash
npx expo install @expo-google-fonts/nunito expo-font expo-splash-screen
```

- [ ] **Step 2: Load before first paint in `app/_layout.tsx`**

```tsx
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';

void SplashScreen.preventAutoHideAsync();

// inside the root component:
const [fontsLoaded] = useFonts({
  Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
});

useEffect(() => {
  // Holding the splash until the font resolves avoids a flash of system font
  // reflowing into Nunito, which is more jarring than a slightly longer splash.
  if (fontsLoaded) void SplashScreen.hideAsync();
}, [fontsLoaded]);

if (!fontsLoaded) return null;
```

- [ ] **Step 3: Map weights to families in `src/ui/theme.ts`**

React Native picks a family, not a numeric weight, for custom fonts. Add `fontFamily` to each type token and drop `fontWeight`:

```ts
const family = {
  regular: 'Nunito_400Regular',
  semi: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
} as const;

const type = {
  display: { fontSize: 34, lineHeight: 38, letterSpacing: 0, fontFamily: family.extra },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0, fontFamily: family.extra },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0, fontFamily: family.regular },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontFamily: family.semi },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontFamily: family.bold },
} as const;
```

Then remove every `fontWeight: '600'`/`'700'`/`'800'` override in components — with a custom family those select a synthetic weight iOS may render as a faux-bold smear.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Then run the app and confirm text is visibly rounded, not SF Pro.

Run: `grep -rn "fontWeight" src app | grep -v render/receipt`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: set the app in Nunito"
```

---

### Task 6: Matted, lifted cards

**Files:**
- Modify: `src/ui/Card.tsx`

**Interfaces:**
- Produces: `<Card>` gains `photoUri?: string | null` and `photoHeight?: number`.

- [ ] **Step 1: Rewrite `Card.tsx`'s surface**

```tsx
const t = useTheme();

const surface = {
  backgroundColor: t.role.surface,
  borderRadius: theme.radius.lg,
  borderWidth: 1,
  borderColor: t.role.line,
  overflow: 'hidden' as const,
  padding: padded ? theme.space.md : 0,
  // Null in dark by design — a shadow on a near-black ground is invisible and
  // a glow standing in for one reads as a rendering bug.
  ...(t.lift ?? {}),
};
```

- [ ] **Step 2: Add the mat**

When `photoUri` is given, render it inset rather than bleeding:

```tsx
{photoUri !== null && photoUri !== undefined && (
  <Image
    source={{ uri: photoUri }}
    style={{
      height: photoHeight ?? 120,
      margin: MAT_INSET,
      borderRadius: theme.radius.md,
    }}
    resizeMode="cover"
  />
)}
```

```tsx
/** The paper border around a print. 6pt reads as a mat; less reads as a mistake. */
const MAT_INSET = 6;
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Then run the app: cards should have a visible hairline border and, in light mode, sit above the ground.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Card.tsx
git commit -m "feat: mat and lift the cards"
```

---

### Task 7: A calendar of your own photos

**Files:**
- Create: `src/domain/analytics/covers.ts`
- Test: `src/domain/analytics/covers.test.ts`
- Modify: `src/ui/CalendarGrid.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Produces: `dailyCovers(db: AppDatabase, scope: CoupleScope, periodMonth: string): { occurredOn: string; coverUri: string }[]`
- Consumes: `monthScope` from `src/domain/analytics/scope.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { seedTwelveMonths } from '@/fixtures/seed';
import { dates, photos } from '@/db/schema';
import { dailyCovers } from './covers';

const AUG = testDeps(1_785_000_000_000, '2026-08-19');

function seeded() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG);
  seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-19', AUG);
  return { db, ctx };
}

describe('dailyCovers', () => {
  it('returns at most one cover per day', () => {
    const { db, ctx } = seeded();
    const rows = dailyCovers(db, ctx, '2026-08');
    const days = rows.map((r) => r.occurredOn);
    expect(new Set(days).size).toBe(days.length);
  });

  it('only returns days inside the month asked for', () => {
    const { db, ctx } = seeded();
    for (const r of dailyCovers(db, ctx, '2026-08')) {
      expect(r.occurredOn.slice(0, 7)).toBe('2026-08');
    }
  });

  it('never returns a null uri', () => {
    // A day with no cover must be absent, not present-with-null: the grid
    // decides between photo and dot on presence alone.
    const { db, ctx } = seeded();
    for (const r of dailyCovers(db, ctx, '2026-08')) {
      expect(typeof r.coverUri).toBe('string');
      expect(r.coverUri.length).toBeGreaterThan(0);
    }
  });

  it('drops a day whose date was deleted', () => {
    const { db, ctx } = seeded();
    const before = dailyCovers(db, ctx, '2026-08');
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0]!;

    db.update(dates)
      .set({ deletedAt: 1 })
      .where(and(eq(dates.occurredOn, victim.occurredOn), eq(dates.coupleId, ctx.coupleId)))
      .run();

    expect(dailyCovers(db, ctx, '2026-08').map((r) => r.occurredOn)).not.toContain(
      victim.occurredOn,
    );
  });

  it('drops a day whose cover photo was deleted', () => {
    const { db, ctx } = seeded();
    const before = dailyCovers(db, ctx, '2026-08');
    const victim = before[0]!;

    db.update(photos).set({ deletedAt: 1 }).where(isNull(photos.deletedAt)).run();

    expect(dailyCovers(db, ctx, '2026-08').map((r) => r.occurredOn)).not.toContain(
      victim.occurredOn,
    );
  });

  it('shows nothing from another couple', () => {
    const { db, ctx } = seeded();
    const rows = dailyCovers(db, { coupleId: 'someone-else', currencyCode: ctx.currencyCode }, '2026-08');
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/analytics/covers.test.ts`
Expected: FAIL — `Cannot find module './covers'`

- [ ] **Step 3: Implement**

```ts
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { dates, photos } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';

export interface DayCover {
  readonly occurredOn: string;
  readonly coverUri: string;
}

/**
 * One cover photo per day for a month, so the calendar can show the couple's
 * own pictures instead of coloured dots.
 *
 * Days without a cover are absent rather than present-with-null: the grid
 * chooses between photo and dot on presence, and a null row would make it
 * decide twice.
 *
 * Not routed through `monthScope`: that predicate scopes by `stops.currencyCode`
 * and joins stops, which would multiply rows per date and drop a photographed
 * date whose stops are all in another currency. A cover is a property of the
 * date, not of its spending.
 */
export function dailyCovers(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
): DayCover[] {
  const rows = db
    .select({ occurredOn: dates.occurredOn, coverUri: photos.localUri })
    .from(dates)
    .innerJoin(photos, and(eq(photos.id, dates.coverPhotoId), isNull(photos.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        isNull(dates.deletedAt),
        isNotNull(dates.coverPhotoId),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .orderBy(dates.occurredOn)
    .all();

  // Two dates on one day is legal; the grid has one cell, so the first wins.
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.coverUri !== null && !seen.has(row.occurredOn)) {
      seen.set(row.occurredOn, row.coverUri);
    }
  }
  return [...seen].map(([occurredOn, coverUri]) => ({ occurredOn, coverUri }));
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/domain/analytics/covers.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Mutation-check the scoping**

Break each guard in turn and confirm a test fails:
- drop `eq(dates.coupleId, scope.coupleId)` → "shows nothing from another couple" fails
- drop `isNull(dates.deletedAt)` → "drops a day whose date was deleted" fails
- drop `isNull(photos.deletedAt)` from the ON clause → "drops a day whose cover photo was deleted" fails
- change `innerJoin` to `leftJoin` → "never returns a null uri" fails

Restore after each. If any mutation leaves the suite green, the test is not guarding what it claims.

- [ ] **Step 6: Render photos in the cells**

`dailyCovers` returns an array and the grid wants lookup by day, so the screen converts
once: `const covers = useMemo(() => new Map(dailyCovers(db, ctx, periodMonth).map((c) => [c.occurredOn, c.coverUri])), [ctx, periodMonth, publishedRows]);`

In `CalendarGrid.tsx`, accept `covers: ReadonlyMap<string, string>` and, for a day present in it, render an `Image` filling the cell at `theme.radius.sm`, with the numeral over a scrim disc:

```tsx
<View style={{
  position: 'absolute', minWidth: 18, height: 18, borderRadius: 9,
  alignItems: 'center', justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 4,
}}>
  <Text style={{ ...theme.type.micro, color: '#FFFFFF', letterSpacing: 0 }}>{day}</Text>
</View>
```

The scrim is a disc behind the numeral, not a wash over the whole cell — a full overlay dulls every photo to make one number legible. Today's accent ring is drawn outside the photo so it survives any image.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run`

```bash
git add -A
git commit -m "feat: fill calendar days with their own cover photos"
```

---

### Task 8: Feed rhythm and richer cards

**Files:**
- Create: `src/domain/dates/rhythm.ts`
- Test: `src/domain/dates/rhythm.test.ts`
- Modify: `src/render/FeedCard.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Produces: `splitHero(dates: readonly FeedDate[]): { hero: FeedDate | null; rest: readonly FeedDate[] }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { splitHero } from './rhythm';

const d = (id: string, occurredOn: string, status = 'published') =>
  ({ id, occurredOn, status, title: null, stopCount: 1, totalMinor: 1, currencyCode: 'PHP',
     coverUri: null, kinds: [] }) as never;

describe('splitHero', () => {
  it('promotes the newest published date', () => {
    const { hero, rest } = splitHero([d('a', '2026-08-17'), d('b', '2026-08-02')]);
    expect(hero?.id).toBe('a');
    expect(rest.map((r) => r.id)).toEqual(['b']);
  });

  it('picks by date, not by list order', () => {
    // The feed arrives sorted, but a hero chosen by position silently breaks
    // the moment any caller sorts differently.
    const { hero } = splitHero([d('old', '2026-08-02'), d('new', '2026-08-17')]);
    expect(hero?.id).toBe('new');
  });

  it('never promotes a draft', () => {
    // A draft is unfinished and usually has no cover; as a full-bleed hero it
    // would be the largest, emptiest thing on the screen.
    const { hero, rest } = splitHero([d('draft', '2026-08-18', 'draft'), d('pub', '2026-08-01')]);
    expect(hero?.id).toBe('pub');
    expect(rest.map((r) => r.id)).toEqual(['draft']);
  });

  it('returns no hero when nothing is published', () => {
    const { hero, rest } = splitHero([d('draft', '2026-08-18', 'draft')]);
    expect(hero).toBeNull();
    expect(rest).toHaveLength(1);
  });

  it('handles an empty feed', () => {
    expect(splitHero([])).toEqual({ hero: null, rest: [] });
  });

  it('keeps every date exactly once', () => {
    const input = [d('a', '2026-08-17'), d('b', '2026-08-02'), d('c', '2026-08-09')];
    const { hero, rest } = splitHero(input);
    expect([...(hero ? [hero.id] : []), ...rest.map((r) => r.id)].sort()).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/dates/rhythm.test.ts`
Expected: FAIL — `Cannot find module './rhythm'`

- [ ] **Step 3: Implement**

```ts
import type { FeedDate } from './repository';

/**
 * Splits the feed into the one date shown full-bleed and the rest shown two-up.
 *
 * Varying the card size is what stops the feed reading as empty and as
 * monotonous at the same time; a uniform column fails one or the other.
 */
export function splitHero(dates: readonly FeedDate[]): {
  hero: FeedDate | null;
  rest: readonly FeedDate[];
} {
  let hero: FeedDate | null = null;

  for (const date of dates) {
    if (date.status !== 'published') continue;
    // Compared by date rather than taken from position: the feed happens to
    // arrive sorted, but a hero chosen by index breaks silently the day a
    // caller sorts differently.
    if (hero === null || date.occurredOn > hero.occurredOn) hero = date;
  }

  return { hero, rest: hero === null ? dates : dates.filter((d) => d.id !== hero!.id) };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/domain/dates/rhythm.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Render the rhythm**

In `app/(tabs)/index.tsx`, apply `splitHero` per month section: the hero renders full-bleed at 16:9 with title and meta over a bottom scrim; `rest` renders in a two-column grid of matted `Card`s.

- [ ] **Step 6: Widen the feed query for places and payers**

Spec §8 asks for place names and who paid. `FeedDate` carries neither, so extend
`feedDatesQuery` in `src/domain/dates/repository.ts` alongside the existing `kinds`
aggregate — same `group_concat(distinct ...)` pattern, same left join, so it cannot
multiply the rows the count and sum are computed over:

```ts
places: sql<string | null>`group_concat(distinct ${stops.placeName})`,
payerCount: sql<number>`count(distinct ${stops.paidByUserId})`,
```

Add to `FeedDate`: `places: readonly string[]` and `payerCount: number`, split and
sorted in `toFeedDate` exactly as `kinds` already is.

Then extend the existing repository test: a date whose stops name two places lists
both; a date whose stops are all in another currency still shows no places rather
than disappearing.

- [ ] **Step 7: Enrich `FeedCard.tsx`**

Add beneath the title:
- the kind timeline — `date.kinds.map(k => <KindIcon kind={k} size={13} color={t.kind[k]} />)` in a row
- `date.places.join(' · ')` on one line, `numberOfLines={1}`
- a "split" marker when `date.payerCount > 1`
- stop count and total, as now

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run`

```bash
git add -A
git commit -m "feat: give the feed a hero and enrich the date cards"
```

---

## Manual verification

Run the app and confirm, in **both** themes:

1. Text is rounded Nunito everywhere, with no flash of system font on launch.
2. Cards show a hairline border; in light they cast a soft shadow, in dark they do not.
3. The calendar shows cover photos on days that have them, and day numbers stay readable on every photo.
4. The newest published date is a full-bleed hero; older dates are two-up.
5. The theme toggle switches instantly and survives a full app restart.
6. No screen shows charcoal `#121016` or the old plum `#1E1B24`.
