# Date Tracker v1 — Plan 1: Foundation & Data Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo app with a couple-shaped SQLite database, a float-free money domain, date/stop repositories implementing the implicit-open-date capture rule, monthly budget math, seeded fixtures, and a working feed screen that proves the whole stack on a device.

**Architecture:** Local-first. SQLite (via Drizzle) is the source of truth; there is no network code in v1. Domain logic is pure TypeScript with zero React imports, and every repository receives its database handle as a parameter so tests can run against `better-sqlite3` in plain Node while the app uses `expo-sqlite`. Both drivers are synchronous and share the `BaseSQLiteDatabase<'sync', …>` type, so one set of repositories serves both.

**Tech Stack:** Expo (dev build, not Expo Go) · expo-router · TypeScript (strict) · expo-sqlite · drizzle-orm + drizzle-kit · better-sqlite3 (tests) · Vitest

**Spec:** `docs/superpowers/specs/2026-08-03-couples-date-tracker-design.md`

## Global Constraints

- **Money is always an integer count of minor units (centavos).** Floats are forbidden anywhere in `src/domain/money`. Parsing from user input is string-based, never `parseFloat(x) * 100`.
- **`src/domain/**` must not import `react`, `react-native`, or any `expo-*` package.** This is what keeps domain tests running in Node.
- **Repositories never import a database singleton.** The handle is always the first parameter.
- **Timestamps are integer epoch milliseconds.** Calendar dates are ISO `YYYY-MM-DD` strings in the couple's local timezone.
- Default currency is `PHP`. Default timezone is `Asia/Manila`.
- TypeScript `strict: true`. No `any` in committed code.
- **No network calls anywhere in v1.**
- Tests run under Vitest in the `node` environment. Render tests are out of scope for this plan.
- **The git repository already exists.** `main` tracks `origin/main` at
  `https://github.com/danielsalipot/date-tracker` (private). Do **not** run `git init` or
  `git remote add`. Every task ends by committing *and* pushing; a task is not complete until
  `git push` succeeds.

---

### Task 1: Scaffold the Expo app and test runner

**Files:**
- Create: `package.json`, `tsconfig.json`, `app.json`, `babel.config.js`, `metro.config.js`, `.gitignore`
- Create: `vitest.config.ts`
- Test: `src/domain/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a runnable Expo project and `npm test` executing Vitest in a `node` environment.

- [ ] **Step 1: Scaffold Expo into the existing directory**

The directory already contains `docs/`, `.superpowers/` **and a live git repository with an
`origin` remote**, so scaffold to a sibling and copy in.

**`--exclude .git` is mandatory.** Without it, rsync copies the scaffold's throwaway git
repository over the real one, destroying the `origin` remote and switching HEAD to a stray
`master` branch.

```bash
cd /Users/danielsalipot/Herd
npx create-expo-app@latest date-tracker-scaffold
rsync -a --exclude node_modules --exclude .git date-tracker-scaffold/ date-tracker/
rm -rf date-tracker-scaffold
cd date-tracker
npm install
```

- [ ] **Step 2: Clear the template example screens**

Expo SDK 57's default template places the router root at `src/app`, not top-level `app/`. This
project uses **top-level `app/`** (Task 8 edits `app/_layout.tsx` and `app/index.tsx`), so the
template's `src/app` must be removed or you end up with two competing router roots.

```bash
cd /Users/danielsalipot/Herd/date-tracker
rm -rf src/app src/components src/constants src/hooks app components constants hooks scripts app-example
mkdir -p app src/domain/__tests__
```

Create `app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

Create `app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Date Tracker</Text>
    </View>
  );
}
```

- [ ] **Step 3: Add `.gitignore` entries**

Append to `.gitignore`:

```
.superpowers/
*.db
*.db-journal
coverage/
```

- [ ] **Step 4: Enforce TypeScript strictness**

Edit `tsconfig.json` so `compilerOptions` contains:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.mts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

`**/*.mts` matters: the Vitest config is an `.mts` file, and without this pattern
`tsc --noEmit` silently stops type-checking the module aliases that Task 3 depends on.

- [ ] **Step 5: Install and configure Vitest**

```bash
npm install -D vitest @types/node
```

Create `vitest.config.mts`. The `.mts` extension lets the config use ESM without adding
`"type": "module"` to `package.json`, which would break Expo's CommonJS `babel.config.js`
and `metro.config.js`.

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // expo-crypto has no Node build; tests use the shim added in Task 3.
      'expo-crypto': path.resolve(import.meta.dirname, './src/test/expo-crypto-shim.ts'),
    },
  },
});
```

Add to `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write the failing smoke test**

Create `src/domain/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in a node environment', () => {
    expect(typeof process.versions.node).toBe('string');
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 8: Verify the app boots**

Run: `npx expo start`
Expected: Metro starts with no TypeScript errors. Press `i` or `a` to confirm "Date Tracker" renders, then stop with `Ctrl+C`.

- [ ] **Step 9: Commit and push**

The repository and the `origin` remote already exist — do not re-initialise them.

```bash
git add -A
git commit -m "chore: scaffold expo app with strict typescript and vitest"
git push
```

---

### Task 2: Money domain

**Files:**
- Create: `src/domain/money/money.ts`
- Test: `src/domain/money/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Money { readonly amountMinor: number; readonly currencyCode: string }`
  - `money(amountMinor: number, currencyCode: string): Money`
  - `zeroMoney(currencyCode: string): Money`
  - `addMoney(a: Money, b: Money): Money`
  - `sumMoney(items: readonly Money[], currencyCode: string): Money`
  - `parseMajorToMinor(input: string, currencyCode: string): Money`
  - `formatMoney(value: Money): string`
  - `minorExponent(currencyCode: string): number`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/money/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  formatMoney,
  money,
  parseMajorToMinor,
  sumMoney,
  zeroMoney,
} from './money';

describe('parseMajorToMinor', () => {
  it('parses whole pesos', () => {
    expect(parseMajorToMinor('2340', 'PHP').amountMinor).toBe(234000);
  });

  it('parses two decimal places', () => {
    expect(parseMajorToMinor('2340.50', 'PHP').amountMinor).toBe(234050);
  });

  it('pads a single decimal place', () => {
    expect(parseMajorToMinor('2340.5', 'PHP').amountMinor).toBe(234050);
  });

  it('handles zero-exponent currencies', () => {
    expect(parseMajorToMinor('1200', 'JPY').amountMinor).toBe(1200);
  });

  it('strips grouping separators', () => {
    expect(parseMajorToMinor('2,340.50', 'PHP').amountMinor).toBe(234050);
  });

  it('rejects more precision than the currency allows', () => {
    expect(() => parseMajorToMinor('10.999', 'PHP')).toThrow(/precision/i);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseMajorToMinor('abc', 'PHP')).toThrow(/invalid/i);
  });

  it('sums exactly in minor units', () => {
    const a = parseMajorToMinor('0.10', 'PHP');
    const b = parseMajorToMinor('0.20', 'PHP');
    expect(addMoney(a, b).amountMinor).toBe(30);
    expect(formatMoney(addMoney(a, b))).toBe('₱0.30');
  });

  // The value of string-based parsing is REJECTION, not precision. A naive
  // Math.round(parseFloat(x) * 100) also returns 30 above — Math.round masks
  // the ~1e-13 error. What it cannot do is refuse malformed input.
  it('rejects trailing garbage that parseFloat would silently accept', () => {
    expect(Number.parseFloat('12abc')).toBe(12);
    expect(() => parseMajorToMinor('12abc', 'PHP')).toThrow(/invalid/i);
  });

  it('rejects scientific notation that parseFloat would silently accept', () => {
    // parseFloat('1e3') returns 1000 — a 1000x error from one stray character.
    expect(Number.parseFloat('1e3')).toBe(1000);
    expect(() => parseMajorToMinor('1e3', 'PHP')).toThrow(/invalid/i);
  });

  it('rejects a bare decimal point', () => {
    expect(() => parseMajorToMinor('.', 'PHP')).toThrow(/invalid/i);
  });
});

describe('addMoney', () => {
  it('adds same-currency amounts', () => {
    expect(addMoney(money(100, 'PHP'), money(250, 'PHP')).amountMinor).toBe(350);
  });

  it('throws on currency mismatch', () => {
    expect(() => addMoney(money(100, 'PHP'), money(100, 'USD'))).toThrow(/currency/i);
  });
});

describe('sumMoney', () => {
  it('returns zero for an empty list', () => {
    expect(sumMoney([], 'PHP')).toEqual(zeroMoney('PHP'));
  });

  it('sums a list', () => {
    const items = [money(42000, 'PHP'), money(124000, 'PHP'), money(68000, 'PHP')];
    expect(sumMoney(items, 'PHP').amountMinor).toBe(234000);
  });
});

describe('formatMoney', () => {
  it('formats pesos with grouping', () => {
    expect(formatMoney(money(234000, 'PHP'))).toBe('₱2,340.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(money(-50000, 'PHP'))).toBe('-₱500.00');
  });

  it('formats zero-exponent currencies without decimals', () => {
    expect(formatMoney(money(1200, 'JPY'))).toBe('¥1,200');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- money`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 3: Implement the money module**

Create `src/domain/money/money.ts`:

```ts
export interface Money {
  readonly amountMinor: number;
  readonly currencyCode: string;
}

const MINOR_EXPONENTS: Readonly<Record<string, number>> = {
  PHP: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  KRW: 0,
};

const SYMBOLS: Readonly<Record<string, string>> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  KRW: '₩',
};

export function minorExponent(currencyCode: string): number {
  return MINOR_EXPONENTS[currencyCode] ?? 2;
}

export function money(amountMinor: number, currencyCode: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`amountMinor must be an integer, received ${amountMinor}`);
  }
  return { amountMinor, currencyCode };
}

export function zeroMoney(currencyCode: string): Money {
  return { amountMinor: 0, currencyCode };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currencyCode !== b.currencyCode) {
    throw new Error(`currency mismatch: ${a.currencyCode} vs ${b.currencyCode}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currencyCode);
}

export function sumMoney(items: readonly Money[], currencyCode: string): Money {
  return items.reduce<Money>((acc, item) => addMoney(acc, item), zeroMoney(currencyCode));
}

/**
 * Parses a major-unit string ("2,340.50") into minor units (234050).
 *
 * Deliberately string-based. `Math.round(parseFloat(x) * 100)` is correct for
 * small values but silently wrong for large ones, and this function guards the
 * integrity of every number in the app.
 */
export function parseMajorToMinor(input: string, currencyCode: string): Money {
  const cleaned = input.trim().replace(/,/g, '');
  // hasDigit rejects '', '-', '.', and '-.' uniformly while still accepting '.5'.
  const hasDigit = /\d/.test(cleaned);
  if (!/^-?\d*(\.\d*)?$/.test(cleaned) || !hasDigit) {
    throw new Error(`invalid money input: "${input}"`);
  }

  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole = '', fraction = ''] = unsigned.split('.');

  const exponent = minorExponent(currencyCode);
  if (fraction.length > exponent) {
    throw new Error(
      `too much precision for ${currencyCode}: "${input}" exceeds ${exponent} decimal places`,
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const digits = `${whole === '' ? '0' : whole}${padded}`;
  const magnitude = Number.parseInt(digits, 10);

  return money(negative ? -magnitude : magnitude, currencyCode);
}

export function formatMoney(value: Money): string {
  const exponent = minorExponent(value.currencyCode);
  const symbol = SYMBOLS[value.currencyCode] ?? `${value.currencyCode} `;
  const negative = value.amountMinor < 0;
  const magnitude = Math.abs(value.amountMinor);

  const divisor = 10 ** exponent;
  const whole = Math.floor(magnitude / divisor);
  const fraction = magnitude % divisor;

  const groupedWhole = whole.toLocaleString('en-US');
  const body =
    exponent === 0
      ? groupedWhole
      : `${groupedWhole}.${String(fraction).padStart(exponent, '0')}`;

  return `${negative ? '-' : ''}${symbol}${body}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- money`
Expected: PASS — all 18 money tests pass.

- [ ] **Step 5: Commit and push**

```bash
git add src/domain/money
git commit -m "feat: add float-free money domain with minor-unit arithmetic"
git push
```

---

### Task 3: Database schema, migrations, and dual-driver client

**Files:**
- Create: `src/db/schema.ts`, `src/db/types.ts`, `src/db/id.ts`, `src/db/client.ts`
- Create: `src/test/expo-crypto-shim.ts`, `src/test/testDb.ts`
- Create: `drizzle.config.ts`
- Modify: `babel.config.js`, `metro.config.js`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>`
  - Tables `users`, `couples`, `coupleMembers`, `dates`, `stops`, `photos`, `budgets`, `outbox`
  - `newId(): string`
  - `createTestDb(): AppDatabase` (test-only, in-memory, migrated)
  - `db: AppDatabase` (app-only singleton in `src/db/client.ts`, used solely by screens)

- [ ] **Step 1: Install dependencies**

```bash
npx expo install expo-sqlite expo-crypto
npm install drizzle-orm
npm install -D drizzle-kit better-sqlite3 @types/better-sqlite3 babel-plugin-inline-import
```

- [ ] **Step 2: Configure Babel and Metro for inlined SQL migrations**

Replace `babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
```

Replace `metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
```

- [ ] **Step 3: Write the schema**

Create `src/db/schema.ts`:

```ts
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUri: text('avatar_uri'),
  updatedAt: integer('updated_at').notNull(),
  serverUpdatedAt: integer('server_updated_at'),
  deletedAt: integer('deleted_at'),
});

export const couples = sqliteTable('couples', {
  id: text('id').primaryKey(),
  title: text('title'),
  anniversaryOn: text('anniversary_on'),
  currencyCode: text('currency_code').notNull().default('PHP'),
  timezone: text('timezone').notNull().default('Asia/Manila'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  serverUpdatedAt: integer('server_updated_at'),
  deletedAt: integer('deleted_at'),
});

export const coupleMembers = sqliteTable(
  'couple_members',
  {
    coupleId: text('couple_id').notNull(),
    userId: text('user_id').notNull(),
    joinedAt: integer('joined_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    // Tombstone, not a hard delete: the unpair policy diverges two copies of a
    // timeline, and a hard-deleted membership would resurrect from the ex-partner.
    deletedAt: integer('deleted_at'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.coupleId, t.userId] }) }),
);

export const dates = sqliteTable(
  'dates',
  {
    id: text('id').primaryKey(),
    coupleId: text('couple_id').notNull(),
    title: text('title'),
    occurredOn: text('occurred_on').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    locationLabel: text('location_label'),
    coverPhotoId: text('cover_photo_id'),
    rating: integer('rating'),
    caption: text('caption'),
    status: text('status').notNull().default('draft'),
    createdBy: text('created_by').notNull(),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCoupleDate: index('dates_couple_occurred_idx').on(t.coupleId, t.occurredOn),
    byStatus: index('dates_status_idx').on(t.coupleId, t.status),
  }),
);

export const stops = sqliteTable(
  'stops',
  {
    id: text('id').primaryKey(),
    dateId: text('date_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    kind: text('kind').notNull(),
    subkind: text('subkind'),
    label: text('label'),
    placeName: text('place_name'),
    lat: real('lat'),
    lng: real('lng'),
    occurredAt: integer('occurred_at'),
    amountMinor: integer('amount_minor').notNull().default(0),
    currencyCode: text('currency_code').notNull(),
    paidByUserId: text('paid_by_user_id'),
    note: text('note'),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byDate: index('stops_date_idx').on(t.dateId, t.sortOrder),
    byKind: index('stops_kind_idx').on(t.kind),
  }),
);

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    dateId: text('date_id').notNull(),
    stopId: text('stop_id'),
    localUri: text('local_uri'),
    remoteKey: text('remote_key'),
    thumbKey: text('thumb_key'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    takenAt: integer('taken_at'),
    uploadState: text('upload_state').notNull().default('local'),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({ byDate: index('photos_date_idx').on(t.dateId) }),
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    coupleId: text('couple_id').notNull(),
    periodMonth: text('period_month').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    updatedAt: integer('updated_at').notNull(),
    serverUpdatedAt: integer('server_updated_at'),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byCouplePeriod: uniqueIndex('budgets_couple_period_idx').on(t.coupleId, t.periodMonth),
  }),
);

/**
 * Created in v1 migrations so v2 requires no schema change, but never written
 * to in v1 — there is no server to drain it to, and pairing performs a full
 * initial push rather than replaying local history.
 */
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op').notNull(),
  queuedAt: integer('queued_at').notNull(),
});
```

- [ ] **Step 4: Add the shared database type and id helper**

Create `src/db/types.ts`:

```ts
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Both expo-sqlite and better-sqlite3 are synchronous drivers, so one type
 * covers the app and the Node test suite. Repositories accept this rather than
 * importing a singleton, which is what lets them be tested without a simulator.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
```

Create `src/db/id.ts`:

```ts
import { randomUUID } from 'expo-crypto';

export function newId(): string {
  return randomUUID();
}
```

Create `src/test/expo-crypto-shim.ts` (aliased in `vitest.config.ts` from Task 1):

```ts
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}
```

- [ ] **Step 5: Generate migrations**

Create `drizzle.config.ts`:

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
```

Run:

```bash
npx drizzle-kit generate
```

Expected: a `drizzle/` directory containing a `0000_*.sql` file and `migrations.js`.

- [ ] **Step 6: Add the test database helper**

Create `src/test/testDb.ts`:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '@/db/schema';
import type { AppDatabase } from '@/db/types';

/** Fresh in-memory database with all migrations applied. */
export function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './drizzle' });
  return db as unknown as AppDatabase;
}
```

- [ ] **Step 7: Add the app database client**

Create `src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import type { AppDatabase } from './types';

// enableChangeListener is required for drizzle's useLiveQuery to react to writes.
const expoDb = openDatabaseSync('datetracker.db', { enableChangeListener: true });

const drizzleDb = drizzle(expoDb, { schema });

/**
 * Typed handle passed to repositories. The cast widens the concrete expo type
 * to the driver-agnostic `AppDatabase` so the same repositories run under
 * better-sqlite3 in Node tests.
 */
export const db = drizzleDb as unknown as AppDatabase;

/** Concrete handle for drizzle's migrator, which requires the expo type. */
export const migrationDb = drizzleDb;

export { expoDb };
```

- [ ] **Step 8: Write the failing schema test**

Create `src/db/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { couples } from './schema';
import { newId } from './id';

describe('schema', () => {
  it('applies migrations and round-trips a couple', () => {
    const db = createTestDb();
    const id = newId();

    db.insert(couples)
      .values({ id, currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1 })
      .run();

    const rows = db.select().from(couples).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.currencyCode).toBe('PHP');
  });

  it('generates distinct ids', () => {
    expect(newId()).not.toBe(newId());
  });
});
```

- [ ] **Step 9: Run the tests**

Run: `npm test -- schema`
Expected: PASS — 2 tests pass.

- [ ] **Step 10: Commit and push**

```bash
git add src/db src/test drizzle drizzle.config.ts babel.config.js metro.config.js package.json package-lock.json
git commit -m "feat: add sqlite schema, migrations and dual-driver database access"
git push
```

---

### Task 4: Clock and local identity bootstrap

**Files:**
- Create: `src/domain/clock.ts`
- Create: `src/domain/identity/bootstrap.ts`
- Test: `src/domain/identity/bootstrap.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `newId`, tables from Task 3
- Produces:
  - `interface Clock { nowMs(): number; todayLocal(): string }`
  - `systemClock(timezone: string): Clock`
  - `fixedClock(nowMs: number, todayLocal: string): Clock`
  - `interface LocalContext { userId: string; coupleId: string; currencyCode: string; timezone: string }`
  - `ensureLocalContext(db: AppDatabase, clock: Clock): LocalContext`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/identity/bootstrap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { coupleMembers, couples, users } from '@/db/schema';
import { fixedClock } from '@/domain/clock';
import { ensureLocalContext } from './bootstrap';

const clock = fixedClock(1_700_000_000_000, '2026-08-03');

describe('ensureLocalContext', () => {
  it('creates a user, couple and membership on first run', () => {
    const db = createTestDb();

    const ctx = ensureLocalContext(db, clock);

    expect(db.select().from(users).all()).toHaveLength(1);
    expect(db.select().from(couples).all()).toHaveLength(1);
    expect(db.select().from(coupleMembers).all()).toHaveLength(1);
    expect(ctx.currencyCode).toBe('PHP');
    expect(ctx.timezone).toBe('Asia/Manila');
  });

  it('is idempotent across launches', () => {
    const db = createTestDb();

    const first = ensureLocalContext(db, clock);
    const second = ensureLocalContext(db, clock);

    expect(second.userId).toBe(first.userId);
    expect(second.coupleId).toBe(first.coupleId);
    expect(db.select().from(couples).all()).toHaveLength(1);
  });
});

describe('fixedClock', () => {
  it('returns the values it was given', () => {
    expect(clock.nowMs()).toBe(1_700_000_000_000);
    expect(clock.todayLocal()).toBe('2026-08-03');
  });
});

describe('systemClock', () => {
  it('formats today as ISO YYYY-MM-DD', () => {
    expect(systemClock('Asia/Manila').todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the given timezone rather than the machine zone', () => {
    // Pacific/Kiritimati is UTC+14 and Pacific/Niue is UTC-11 — 25 hours apart,
    // so their local calendar dates always differ, whenever this test runs.
    expect(systemClock('Pacific/Kiritimati').todayLocal()).not.toBe(
      systemClock('Pacific/Niue').todayLocal(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- bootstrap`
Expected: FAIL — `Failed to resolve import "./bootstrap"`.

- [ ] **Step 3: Implement the clock**

Create `src/domain/clock.ts`:

```ts
export interface Clock {
  /** Current time as integer epoch milliseconds. */
  nowMs(): number;
  /** Today's calendar date in the couple's timezone, as ISO YYYY-MM-DD. */
  todayLocal(): string;
}

/**
 * Time is injected rather than read from globals so that every date-boundary
 * behaviour — "capture creates today's draft", month attribution — is testable
 * deterministically instead of only at 11:59pm.
 */
export function systemClock(timezone: string): Clock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return {
    nowMs: () => Date.now(),
    // formatToParts reads fields by name instead of relying on a locale's
    // field order. `en-CA` happens to render YYYY-MM-DD in current ICU, but
    // that is a locale convention rather than a guarantee — and React Native's
    // Hermes engine has patchier Intl support than Node, so a locale-string
    // approach can pass in tests and misformat on a real Android device.
    todayLocal: () => {
      const parts = formatter.formatToParts(new Date());
      const field = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
      return `${field('year')}-${field('month')}-${field('day')}`;
    },
  };
}

export function fixedClock(nowMs: number, todayLocal: string): Clock {
  return { nowMs: () => nowMs, todayLocal: () => todayLocal };
}
```

- [ ] **Step 4: Implement the bootstrap**

Create `src/domain/identity/bootstrap.ts`:

```ts
import { coupleMembers, couples, users } from '@/db/schema';
import { newId } from '@/db/id';
import type { AppDatabase } from '@/db/types';
import type { Clock } from '@/domain/clock';

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
export function ensureLocalContext(db: AppDatabase, clock: Clock): LocalContext {
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

  const now = clock.nowMs();
  const userId = newId();
  const coupleId = newId();

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- bootstrap`
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit and push**

```bash
git add src/domain/clock.ts src/domain/identity
git commit -m "feat: add injectable clock and local identity bootstrap"
git push
```

---

### Task 5: Stop taxonomy and capture repository

**Files:**
- Create: `src/domain/stops/taxonomy.ts`
- Create: `src/domain/dates/repository.ts`
- Test: `src/domain/dates/repository.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `Clock`, `LocalContext`, tables from Task 3
- Produces:
  - `type StopKind = 'food' | 'transport' | 'activity' | 'shopping' | 'gift' | 'other'`
  - `const STOP_KINDS: readonly StopKind[]`
  - `const SUBKINDS: Readonly<Record<StopKind, readonly string[]>>`
  - `isValidSubkind(kind: StopKind, subkind: string): boolean`
  - `interface CaptureStopInput { coupleId, userId, kind, subkind?, amountMinor, currencyCode, label?, placeName? }`
  - `interface CaptureResult { stopId: string; dateId: string; createdDate: boolean }`
  - `captureStop(db: AppDatabase, clock: Clock, input: CaptureStopInput): CaptureResult`
  - `feedDatesQuery(db: AppDatabase, coupleId: string)` — returns the **unexecuted** Drizzle
    query builder, so `useLiveQuery` can subscribe to it in Task 8
  - `toFeedDate(row: FeedDateRow): FeedDate`
  - `listFeedDates(db: AppDatabase, coupleId: string): FeedDate[]`
  - `interface FeedDate { id, title, occurredOn, status, stopCount, totalMinor, currencyCode }`

- [ ] **Step 1: Write the taxonomy**

Create `src/domain/stops/taxonomy.ts`:

```ts
export const STOP_KINDS = ['food', 'transport', 'activity', 'shopping', 'gift', 'other'] as const;

export type StopKind = (typeof STOP_KINDS)[number];

/**
 * Two levels by design. `kind` is chosen during quick-capture (six chips) and is
 * effectively permanent once data exists. `subkind` is optional, set later in the
 * composer, and can be added or renamed without breaking historical roll-ups.
 */
export const SUBKINDS: Readonly<Record<StopKind, readonly string[]>> = {
  food: ['restaurant', 'cafe', 'dessert', 'street', 'groceries'],
  transport: ['grab', 'fuel', 'toll', 'parking', 'jeep', 'bus'],
  activity: ['tickets', 'movie', 'videoke', 'sports', 'event'],
  shopping: ['clothes', 'books', 'home', 'other'],
  gift: ['flowers', 'jewelry', 'surprise'],
  other: [],
};

export function isValidSubkind(kind: StopKind, subkind: string): boolean {
  return SUBKINDS[kind].includes(subkind);
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/domain/dates/repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/testDb';
import { dates, stops } from '@/db/schema';
import { fixedClock } from '@/domain/clock';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop, listFeedDates } from './repository';
import type { AppDatabase } from '@/db/types';

const AUG_3 = fixedClock(1_785_000_000_000, '2026-08-03');
const AUG_4 = fixedClock(1_785_090_000_000, '2026-08-04');

function setup(): { db: AppDatabase; coupleId: string; userId: string } {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_3);
  return { db, coupleId: ctx.coupleId, userId: ctx.userId };
}

describe('captureStop', () => {
  it('creates a draft date when none exists for today', () => {
    const { db, coupleId, userId } = setup();

    const result = captureStop(db, AUG_3, {
      coupleId,
      userId,
      kind: 'food',
      amountMinor: 42000,
      currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);

    const rows = db.select().from(dates).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('draft');
    expect(rows[0]?.occurredOn).toBe('2026-08-03');
  });

  it('appends to today\'s existing draft instead of creating another', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const second = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    expect(second.createdDate).toBe(false);
    expect(second.dateId).toBe(first.dateId);
    expect(db.select().from(dates).all()).toHaveLength(1);
    expect(db.select().from(stops).all()).toHaveLength(2);
  });

  it('increments sort_order in capture order', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP' });

    const orders = db.select().from(stops).all().map((s) => s.sortOrder).sort();
    expect(orders).toEqual([0, 1]);
  });

  it('starts a new date on a new day', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });

    expect(db.select().from(dates).all()).toHaveLength(2);
  });

  it('picks the most recently updated draft when today has two', () => {
    const { db, coupleId, userId } = setup();

    // Two drafts for the same day can exist if one was created by a future
    // import path. Capture must never ask the user to disambiguate.
    const older = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });
    db.insert(dates).values({
      id: 'second-draft', coupleId, occurredOn: '2026-08-03', status: 'draft',
      createdBy: userId, updatedAt: AUG_3.nowMs() + 5_000,
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 2, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('second-draft');
    expect(result.dateId).not.toBe(older.dateId);
  });

  it('orders drafts by updated_at, not by insertion order or id', () => {
    const { db, coupleId, userId } = setup();
    const base = AUG_3.nowMs();

    // The winner ('mmmm') is neither the first nor the last inserted, and has
    // neither the lowest nor the highest id. Only ORDER BY updated_at DESC can
    // select it — every other plausible ordering picks 'aaaa' or 'zzzz'.
    for (const [id, updatedAt] of [
      ['aaaa-draft', base + 1_000],
      ['mmmm-draft', base + 9_000],
      ['zzzz-draft', base + 2_000],
    ] as const) {
      db.insert(dates).values({
        id, coupleId, occurredOn: '2026-08-03', status: 'draft',
        createdBy: userId, updatedAt,
      }).run();
    }

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.dateId).toBe('mmmm-draft');
  });

  it('never reuses a sort_order after a stop is tombstoned', () => {
    const { db, coupleId, userId } = setup();

    const first = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' });
    const second = captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 2, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 3, currencyCode: 'PHP' });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, second.stopId)).run();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 4, currencyCode: 'PHP' });

    const live = db.select().from(stops).where(isNull(stops.deletedAt)).all();
    const orders = live.map((s) => s.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 2, 3]);
    expect(new Set(orders).size).toBe(orders.length);
    expect(first.stopId).not.toBe(second.stopId);
  });

  it('ignores published dates when finding today\'s draft', () => {
    const { db, coupleId, userId } = setup();

    db.insert(dates).values({
      id: 'published', coupleId, occurredOn: '2026-08-03', status: 'published',
      createdBy: userId, updatedAt: AUG_3.nowMs(),
    }).run();

    const result = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    expect(result.createdDate).toBe(true);
    expect(result.dateId).not.toBe('published');
  });
});

describe('listFeedDates', () => {
  it('returns dates with stop counts and totals, newest first', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP' });
    captureStop(db, AUG_4, { coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP' });

    const feed = listFeedDates(db, coupleId);

    expect(feed).toHaveLength(2);
    expect(feed[0]?.occurredOn).toBe('2026-08-04');
    expect(feed[1]?.stopCount).toBe(2);
    expect(feed[1]?.totalMinor).toBe(110000);
  });

  it('excludes tombstoned stops from counts and totals', () => {
    const { db, coupleId, userId } = setup();

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP' });
    const removed = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'transport', amountMinor: 68000, currencyCode: 'PHP',
    });

    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, removed.stopId)).run();

    const feed = listFeedDates(db, coupleId);
    expect(feed[0]?.stopCount).toBe(1);
    expect(feed[0]?.totalMinor).toBe(42000);
  });

  it('keeps a date visible when every one of its stops is tombstoned', () => {
    const { db, coupleId, userId } = setup();

    const only = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, only.stopId)).run();

    // Guards the leftJoin ON-clause: moving isNull(stops.deletedAt) into the
    // WHERE clause would make this date vanish from the feed entirely.
    const feed = listFeedDates(db, coupleId);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.stopCount).toBe(0);
    expect(feed[0]?.totalMinor).toBe(0);
  });

  it('excludes soft-deleted dates and stops', () => {
    const { db, coupleId, userId } = setup();

    const kept = captureStop(db, AUG_3, {
      coupleId, userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
    });
    const removed = captureStop(db, AUG_4, {
      coupleId, userId, kind: 'food', amountMinor: 99000, currencyCode: 'PHP',
    });

    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, removed.dateId)).run();

    const feed = listFeedDates(db, coupleId);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.id).toBe(kept.dateId);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- repository`
Expected: FAIL — `Failed to resolve import "./repository"`.

- [ ] **Step 4: Implement the repository**

Create `src/domain/dates/repository.ts`:

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import { newId } from '@/db/id';
import type { AppDatabase } from '@/db/types';
import type { Clock } from '@/domain/clock';
import type { StopKind } from '@/domain/stops/taxonomy';

export interface CaptureStopInput {
  coupleId: string;
  userId: string;
  kind: StopKind;
  subkind?: string | null;
  amountMinor: number;
  currencyCode: string;
  label?: string | null;
  placeName?: string | null;
}

export interface CaptureResult {
  stopId: string;
  dateId: string;
  createdDate: boolean;
}

export interface FeedDate {
  id: string;
  title: string | null;
  occurredOn: string;
  status: string;
  stopCount: number;
  totalMinor: number;
  currencyCode: string;
}

/**
 * The implicit-open-date rule: capture never asks which date a stop belongs to.
 * It appends to today's draft, creating one silently if none exists. This is
 * what makes the sub-five-second capture target reachable.
 */
export function captureStop(
  db: AppDatabase,
  clock: Clock,
  input: CaptureStopInput,
): CaptureResult {
  const now = clock.nowMs();
  const today = clock.todayLocal();

  const openDrafts = db
    .select()
    .from(dates)
    .where(
      and(
        eq(dates.coupleId, input.coupleId),
        eq(dates.occurredOn, today),
        eq(dates.status, 'draft'),
        isNull(dates.deletedAt),
      ),
    )
    .orderBy(desc(dates.updatedAt))
    .all();

  const existing = openDrafts[0];
  const dateId = existing?.id ?? newId();
  const createdDate = existing === undefined;

  if (createdDate) {
    db.insert(dates)
      .values({
        id: dateId,
        coupleId: input.coupleId,
        occurredOn: today,
        status: 'draft',
        createdBy: input.userId,
        startedAt: now,
        updatedAt: now,
      })
      .run();
  } else {
    db.update(dates).set({ updatedAt: now }).where(eq(dates.id, dateId)).run();
  }

  // MAX over ALL siblings, tombstoned included. Counting only live stops would
  // reuse a number after a delete: with stops at 0, 1, 2, tombstoning the one
  // at 1 leaves two live siblings, so the next capture would be assigned 2 and
  // collide with the stop already there. The (date_id, sort_order) index is not
  // unique, so nothing would catch it — the timeline just loses its order.
  const ordering = db
    .select({ maxOrder: sql<number | null>`max(${stops.sortOrder})` })
    .from(stops)
    .where(eq(stops.dateId, dateId))
    .all();

  const stopId = newId();
  db.insert(stops)
    .values({
      id: stopId,
      dateId,
      sortOrder: (ordering[0]?.maxOrder ?? -1) + 1,
      kind: input.kind,
      subkind: input.subkind ?? null,
      label: input.label ?? null,
      placeName: input.placeName ?? null,
      occurredAt: now,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
      paidByUserId: input.userId,
      updatedAt: now,
    })
    .run();

  return { stopId, dateId, createdDate };
}

export interface FeedDateRow {
  id: string;
  title: string | null;
  occurredOn: string;
  status: string;
  stopCount: number;
  totalMinor: number;
}

/**
 * Returns the query builder WITHOUT executing it. Drizzle's `useLiveQuery`
 * subscribes to a query object, not to an array, so the builder and the
 * executed result are exposed separately: screens use the builder for
 * reactivity, tests use `listFeedDates` for a plain value.
 */
export function feedDatesQuery(db: AppDatabase, coupleId: string) {
  return db
    .select({
      id: dates.id,
      title: dates.title,
      occurredOn: dates.occurredOn,
      status: dates.status,
      stopCount: sql<number>`count(${stops.id})`,
      totalMinor: sql<number>`coalesce(sum(${stops.amountMinor}), 0)`,
    })
    .from(dates)
    .leftJoin(stops, and(eq(stops.dateId, dates.id), isNull(stops.deletedAt)))
    .where(and(eq(dates.coupleId, coupleId), isNull(dates.deletedAt)))
    .groupBy(dates.id)
    .orderBy(desc(dates.occurredOn));
}

export function toFeedDate(row: FeedDateRow): FeedDate {
  return {
    id: row.id,
    title: row.title,
    occurredOn: row.occurredOn,
    status: row.status,
    stopCount: Number(row.stopCount),
    totalMinor: Number(row.totalMinor),
    currencyCode: 'PHP',
  };
}

export function listFeedDates(db: AppDatabase, coupleId: string): FeedDate[] {
  return feedDatesQuery(db, coupleId).all().map(toFeedDate);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- repository`
Expected: PASS — 8 tests pass.

- [ ] **Step 6: Commit and push**

```bash
git add src/domain/stops src/domain/dates
git commit -m "feat: add stop taxonomy and implicit-open-date capture repository"
git push
```

---

### Task 6: Monthly budget domain

**Files:**
- Create: `src/domain/budget/period.ts`
- Create: `src/domain/budget/status.ts`
- Test: `src/domain/budget/period.test.ts`, `src/domain/budget/status.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `Clock`, tables from Task 3
- Produces:
  - `periodMonthFor(isoDate: string): string`
  - `daysRemainingIn(periodMonth: string, todayLocal: string): number`
  - `interface BudgetStatus { periodMonth, budgetMinor, spentMinor, remainingMinor, isOverBudget, daysLeft }`
  - `setBudget(db, coupleId, periodMonth, amountMinor, clock): void`
  - `computeBudgetStatus(db, coupleId, clock): BudgetStatus`

**Design note — over-budget behaviour.** `remainingMinor` goes negative and `isOverBudget` becomes true. It is deliberately **not clamped at zero**: clamping hides the single number the user most needs to see. When no budget exists for the month, `budgetMinor` and `remainingMinor` are `null` and `isOverBudget` is `false` — absence of a budget is not a failure state.

- [ ] **Step 1: Write the failing period tests**

Create `src/domain/budget/period.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daysRemainingIn, periodMonthFor } from './period';

describe('periodMonthFor', () => {
  it('extracts the year-month', () => {
    expect(periodMonthFor('2026-08-03')).toBe('2026-08');
  });

  it('handles december', () => {
    expect(periodMonthFor('2026-12-31')).toBe('2026-12');
  });

  it('rejects malformed dates', () => {
    expect(() => periodMonthFor('03-08-2026')).toThrow(/iso date/i);
  });
});

describe('daysRemainingIn', () => {
  it('counts days left including today', () => {
    expect(daysRemainingIn('2026-08', '2026-08-30')).toBe(2);
  });

  it('returns 1 on the last day', () => {
    expect(daysRemainingIn('2026-08', '2026-08-31')).toBe(1);
  });

  it('handles february in a leap year', () => {
    expect(daysRemainingIn('2028-02', '2028-02-28')).toBe(2);
  });

  it('returns 0 when today is outside the period', () => {
    expect(daysRemainingIn('2026-08', '2026-09-01')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- period`
Expected: FAIL — `Failed to resolve import "./period"`.

- [ ] **Step 3: Implement period math**

Create `src/domain/budget/period.ts`:

```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function periodMonthFor(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error(`expected ISO date YYYY-MM-DD, received "${isoDate}"`);
  }
  return isoDate.slice(0, 7);
}

function daysInMonth(periodMonth: string): number {
  const [yearText = '', monthText = ''] = periodMonth.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days left in the period counting today, or 0 if today is outside it. */
export function daysRemainingIn(periodMonth: string, todayLocal: string): number {
  if (periodMonthFor(todayLocal) !== periodMonth) return 0;
  const day = Number.parseInt(todayLocal.slice(8, 10), 10);
  return daysInMonth(periodMonth) - day + 1;
}
```

- [ ] **Step 4: Run to verify the period tests pass**

Run: `npm test -- period`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Write the failing status tests**

Create `src/domain/budget/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/testDb';
import { stops } from '@/db/schema';
import { fixedClock } from '@/domain/clock';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { computeBudgetStatus, setBudget } from './status';

const AUG_30 = fixedClock(1_787_000_000_000, '2026-08-30');
const SEP_1 = fixedClock(1_787_300_000_000, '2026-09-01');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_30);
  return { db, ...ctx };
}

describe('computeBudgetStatus', () => {
  it('reports null budget when none is set', () => {
    const { db, coupleId } = setup();

    const status = computeBudgetStatus(db, coupleId, AUG_30);

    expect(status.budgetMinor).toBeNull();
    expect(status.remainingMinor).toBeNull();
    expect(status.isOverBudget).toBe(false);
    expect(status.spentMinor).toBe(0);
  });

  it('subtracts this month\'s spend from the budget', () => {
    const { db, coupleId, userId } = setup();
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, coupleId, AUG_30);

    expect(status.spentMinor).toBe(234000);
    expect(status.remainingMinor).toBe(566000);
    expect(status.isOverBudget).toBe(false);
    expect(status.daysLeft).toBe(2);
  });

  it('goes negative when over budget rather than clamping', () => {
    const { db, coupleId, userId } = setup();
    setBudget(db, coupleId, '2026-08', 100000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 150000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, coupleId, AUG_30);

    expect(status.remainingMinor).toBe(-50000);
    expect(status.isOverBudget).toBe(true);
  });

  it('excludes spend from other months', () => {
    const { db, coupleId, userId } = setup();
    setBudget(db, coupleId, '2026-09', 800000, SEP_1);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });
    captureStop(db, SEP_1, { coupleId, userId, kind: 'food', amountMinor: 50000, currencyCode: 'PHP' });

    const status = computeBudgetStatus(db, coupleId, SEP_1);

    expect(status.periodMonth).toBe('2026-09');
    expect(status.spentMinor).toBe(50000);
  });

  it("attributes spend by the date's occurred_on, not the stop's own timestamp", () => {
    const { db, coupleId, userId } = setup();
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    const captured = captureStop(db, AUG_30, {
      coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP',
    });

    // Push the stop's own timestamp into a different month. A date running past
    // midnight must still count entirely in its date's month, so this must not
    // change the August total. If the query ever joined on stops.occurred_at
    // instead, spentMinor would drop to 0 here.
    db.update(stops)
      .set({ occurredAt: Date.parse('2026-09-15T03:00:00Z') })
      .where(eq(stops.id, captured.stopId))
      .run();

    expect(computeBudgetStatus(db, coupleId, AUG_30).spentMinor).toBe(234000);
  });

  it('overwrites an existing budget for the same period', () => {
    const { db, coupleId } = setup();

    setBudget(db, coupleId, '2026-08', 800000, AUG_30);
    setBudget(db, coupleId, '2026-08', 500000, AUG_30);

    expect(computeBudgetStatus(db, coupleId, AUG_30).budgetMinor).toBe(500000);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- status`
Expected: FAIL — `Failed to resolve import "./status"`.

- [ ] **Step 7: Implement budget status**

Create `src/domain/budget/status.ts`:

```ts
import { and, eq, isNull, sql } from 'drizzle-orm';
import { budgets, dates, stops } from '@/db/schema';
import { newId } from '@/db/id';
import type { AppDatabase } from '@/db/types';
import type { Clock } from '@/domain/clock';
import { daysRemainingIn, periodMonthFor } from './period';

export interface BudgetStatus {
  periodMonth: string;
  budgetMinor: number | null;
  spentMinor: number;
  remainingMinor: number | null;
  isOverBudget: boolean;
  daysLeft: number;
}

export function setBudget(
  db: AppDatabase,
  coupleId: string,
  periodMonth: string,
  amountMinor: number,
  clock: Clock,
): void {
  const now = clock.nowMs();
  const existing = db
    .select()
    .from(budgets)
    .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
    .all();

  if (existing.length > 0) {
    db.update(budgets)
      .set({ amountMinor, updatedAt: now, deletedAt: null })
      .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
      .run();
    return;
  }

  db.insert(budgets)
    .values({ id: newId(), coupleId, periodMonth, amountMinor, updatedAt: now })
    .run();
}

/**
 * Spend is attributed to the month of the parent date's `occurred_on`, not the
 * stop's own timestamp, so a date running past midnight counts entirely in one
 * month and "this date cost X" agrees between the receipt and the dashboard.
 */
export function computeBudgetStatus(
  db: AppDatabase,
  coupleId: string,
  clock: Clock,
): BudgetStatus {
  const today = clock.todayLocal();
  const periodMonth = periodMonthFor(today);

  const spentRows = db
    .select({ total: sql<number>`coalesce(sum(${stops.amountMinor}), 0)` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    .where(
      and(
        eq(dates.coupleId, coupleId),
        isNull(dates.deletedAt),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .all();

  const spentMinor = Number(spentRows[0]?.total ?? 0);

  const budgetRows = db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.coupleId, coupleId),
        eq(budgets.periodMonth, periodMonth),
        isNull(budgets.deletedAt),
      ),
    )
    .all();

  const budgetMinor = budgetRows[0]?.amountMinor ?? null;
  const remainingMinor = budgetMinor === null ? null : budgetMinor - spentMinor;

  return {
    periodMonth,
    budgetMinor,
    spentMinor,
    remainingMinor,
    isOverBudget: remainingMinor !== null && remainingMinor < 0,
    daysLeft: daysRemainingIn(periodMonth, today),
  };
}
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 9: Commit and push**

```bash
git add src/domain/budget
git commit -m "feat: add monthly budget period math and live status calculation"
git push
```

---

### Task 7: Development fixtures

**Files:**
- Create: `src/fixtures/seed.ts`
- Test: `src/fixtures/seed.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `Clock`, `captureStop`, `setBudget`
- Produces: `seedTwelveMonths(db: AppDatabase, coupleId: string, userId: string, endDate: string): void`

- [ ] **Step 1: Write the failing test**

Create `src/fixtures/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/test/testDb';
import { fixedClock } from '@/domain/clock';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { listFeedDates } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { seedTwelveMonths } from './seed';

const AUG_3 = fixedClock(1_785_000_000_000, '2026-08-03');

describe('seedTwelveMonths', () => {
  it('creates a year of dates with stops and budgets', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');

    const feed = listFeedDates(db, ctx.coupleId);
    // Exactly 48: offsets step 7 days with at most 2 days of jitter, so every
    // generated day is distinct. A loose `>= 36` would let a future change
    // silently drop a quarter of the fixtures without failing.
    expect(feed).toHaveLength(48);
    expect(feed.every((d) => d.stopCount >= 2 && d.stopCount <= 4)).toBe(true);
    expect(feed.every((d) => d.totalMinor > 0)).toBe(true);
  });

  it('creates a budget for every month it seeded spend into', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');

    const spentMonths = new Set(listFeedDates(db, ctx.coupleId).map((d) => d.occurredOn.slice(0, 7)));
    const budgetedMonths = new Set(
      db.select().from(budgets).all().map((b) => b.periodMonth),
    );

    for (const month of spentMonths) {
      expect(budgetedMonths.has(month)).toBe(true);
    }
  });

  it('produces a budget for the current month', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');

    expect(computeBudgetStatus(db, ctx.coupleId, AUG_3).budgetMinor).toBe(800000);
  });

  it('is deterministic', () => {
    const runOnce = () => {
      const db = createTestDb();
      const ctx = ensureLocalContext(db, AUG_3);
      seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03');
      return listFeedDates(db, ctx.coupleId).map((d) => d.totalMinor);
    };

    expect(runOnce()).toEqual(runOnce());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- seed`
Expected: FAIL — `Failed to resolve import "./seed"`.

- [ ] **Step 3: Implement the seeder**

Create `src/fixtures/seed.ts`:

```ts
import { fixedClock } from '@/domain/clock';
import { captureStop } from '@/domain/dates/repository';
import { setBudget } from '@/domain/budget/status';
import { periodMonthFor } from '@/domain/budget/period';
import type { AppDatabase } from '@/db/types';
import type { StopKind } from '@/domain/stops/taxonomy';

interface Template {
  kind: StopKind;
  subkind: string;
  label: string;
  placeName: string;
  baseMinor: number;
}

const TEMPLATES: readonly Template[] = [
  { kind: 'food', subkind: 'cafe', label: 'Morning coffee', placeName: 'Bo\'s Coffee', baseMinor: 42000 },
  { kind: 'food', subkind: 'restaurant', label: 'Lunch', placeName: 'Bag of Beans', baseMinor: 124000 },
  { kind: 'food', subkind: 'dessert', label: 'Milk tea', placeName: 'Macao Imperial', baseMinor: 32000 },
  { kind: 'transport', subkind: 'fuel', label: 'Gas', placeName: 'Shell', baseMinor: 68000 },
  { kind: 'transport', subkind: 'grab', label: 'Grab ride', placeName: 'Grab', baseMinor: 38000 },
  { kind: 'activity', subkind: 'movie', label: 'Cinema', placeName: 'SM Cinema', baseMinor: 56000 },
  { kind: 'activity', subkind: 'videoke', label: 'Videoke', placeName: 'Centerstage', baseMinor: 90000 },
  { kind: 'shopping', subkind: 'clothes', label: 'Uniqlo run', placeName: 'Uniqlo', baseMinor: 149000 },
  { kind: 'gift', subkind: 'flowers', label: 'Flowers', placeName: 'Dangwa', baseMinor: 75000 },
];

/**
 * Deterministic pseudo-random in [0, 1) so fixtures are reproducible.
 *
 * mulberry32, not the usual `Math.sin(seed * 12.9898)` trick: ECMA-262 does not
 * require Math.sin to be correctly rounded, so a sin-based generator can produce
 * different fixtures in Node (V8) than on-device (Hermes). This uses only
 * Math.imul, XOR and shifts, all of which are bit-exact per spec.
 */
function seededUnit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shiftDays(isoDate: string, days: number): string {
  const [y = '0', m = '0', d = '0'] = isoDate.split('-');
  const base = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Seeds roughly a year of realistic history. Without this the dashboard cannot
 * be developed without hand-logging fifty dates, and charts get shipped having
 * only ever been seen with three data points.
 */
export function seedTwelveMonths(
  db: AppDatabase,
  coupleId: string,
  userId: string,
  endDate: string,
): void {
  const dateCount = 48;
  const months = new Set<string>();

  for (let i = 0; i < dateCount; i += 1) {
    const day = shiftDays(endDate, -i * 7 - Math.floor(seededUnit(i) * 3));
    // Derived from the day actually generated. A parallel loop over un-jittered
    // offsets can miss a month: jitter only moves dates earlier, so the oldest
    // sample can land in a month no budget was ever created for.
    months.add(periodMonthFor(day));
    const clock = fixedClock(Date.parse(`${day}T12:00:00Z`), day);

    const stopCount = 2 + Math.floor(seededUnit(i + 100) * 3);
    for (let s = 0; s < stopCount; s += 1) {
      const template = TEMPLATES[(i + s * 3) % TEMPLATES.length];
      if (!template) continue;

      const jitter = 0.8 + seededUnit(i * 10 + s) * 0.4;
      captureStop(db, clock, {
        coupleId,
        userId,
        kind: template.kind,
        subkind: template.subkind,
        label: template.label,
        placeName: template.placeName,
        amountMinor: Math.round((template.baseMinor * jitter) / 100) * 100,
        currencyCode: 'PHP',
      });
    }
  }

  const seedClock = fixedClock(Date.parse(`${endDate}T12:00:00Z`), endDate);
  for (const month of months) {
    setBudget(db, coupleId, month, 800000, seedClock);
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `npm test -- seed`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit and push**

```bash
git add src/fixtures
git commit -m "feat: add deterministic twelve-month fixture seeder"
git push
```

---

### Task 8: Feed screen wired to live queries

**Files:**
- Create: `src/ui/theme.ts`
- Modify: `app/_layout.tsx`, `app/index.tsx`
- Test: manual on device (render tests are out of scope for this plan)

**Interfaces:**
- Consumes: `db` from `src/db/client.ts`, `ensureLocalContext`, `listFeedDates`, `computeBudgetStatus`, `seedTwelveMonths`, `formatMoney`, `systemClock`
- Produces: a running app displaying seeded dates and the live budget remaining.

- [ ] **Step 1: Add theme tokens**

Create `src/ui/theme.ts`:

```ts
export const theme = {
  color: {
    ink: '#1F1A24',
    rose: '#E8927C',
    cream: '#FFFBF7',
    blush: '#F7E6E1',
    gold: '#C9A227',
    muted: '#A08E86',
    line: '#EADFD8',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24 },
  radius: { sm: 8, md: 16, lg: 20 },
} as const;
```

- [ ] **Step 2: Run migrations at app startup**

Replace `app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { migrationDb } from '@/db/client';
import { theme } from '@/ui/theme';

export default function RootLayout() {
  const { success, error } = useMigrations(migrationDb, migrations);

  if (error) {
    // A failed migration must never brick the app — surface it plainly.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Database update failed</Text>
        <Text style={{ color: theme.color.muted, marginTop: theme.space.sm }}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.color.muted }}>Preparing…</Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Build the feed screen**

Replace `app/index.tsx`:

```tsx
import { useMemo } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '@/db/client';
import { systemClock } from '@/domain/clock';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { feedDatesQuery, toFeedDate } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { formatMoney, money } from '@/domain/money/money';
import { seedTwelveMonths } from '@/fixtures/seed';
import { theme } from '@/ui/theme';

export default function Feed() {
  const ctx = useMemo(() => ensureLocalContext(db, systemClock('Asia/Manila')), []);
  const clock = useMemo(() => systemClock(ctx.timezone), [ctx.timezone]);

  // useLiveQuery re-runs whenever the underlying tables change, so no state
  // library and no manual refresh are needed. SQLite is the store.
  const { data } = useLiveQuery(feedDatesQuery(db, ctx.coupleId));
  const dates = useMemo(() => data.map(toFeedDate), [data]);

  // Budget spans two queries, so it cannot be a single live query. Recomputing
  // it when `data` changes is sufficient: every stop write changes `data`.
  const budget = useMemo(
    () => computeBudgetStatus(db, ctx.coupleId, clock),
    [ctx.coupleId, clock, data],
  );

  const remaining =
    budget.remainingMinor === null
      ? 'No budget set'
      : `${formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left · ${budget.daysLeft}d`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: theme.color.ink }}>Our dates</Text>
        <Text style={{ color: budget.isOverBudget ? theme.color.rose : theme.color.muted, marginTop: 4 }}>
          {remaining}
        </Text>
      </View>

      <FlatList
        data={dates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md, paddingBottom: theme.space.lg }}
        ListEmptyComponent={
          <Pressable
            onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, clock.todayLocal())}
            style={{
              padding: theme.space.lg,
              borderRadius: theme.radius.md,
              backgroundColor: theme.color.blush,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Seed 12 months of demo dates</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.color.line,
              padding: theme.space.md,
              marginBottom: theme.space.sm,
            }}
          >
            <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
              {item.occurredOn.toUpperCase()} · {item.status.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.color.ink, marginTop: 2 }}>
              {item.title ?? 'Untitled date'}
            </Text>
            <Text style={{ color: theme.color.muted, marginTop: 4 }}>
              {item.stopCount} stops · {formatMoney(money(item.totalMinor, item.currencyCode))}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Build and run a development build**

The app cannot run in Expo Go — `expo-sqlite` requires a native module.

```bash
npx expo prebuild --clean
npx expo run:ios
```

(Use `npx expo run:android` if you prefer Android.)

Expected: app launches, shows "Our dates", "No budget set", and the seed button.

- [ ] **Step 5: Verify the stack end-to-end**

Tap **"Seed 12 months of demo dates"**.

Expected: the list fills with ~48 dates, each showing a stop count and a peso total, and the header switches from "No budget set" to a remaining figure with days left.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit and push**

```bash
git add app src/ui
git commit -m "feat: add feed screen wired to local database and budget status"
git push
```

---

## Plan self-review

**Spec coverage.** §4 data model → Task 3. §4 v1 local identity → Task 4. §5 taxonomy → Task 5. §6 module boundaries → enforced by Global Constraints and the DI pattern in Tasks 3–7. §7.1 quick-capture rule, including the two-drafts case → Task 5. §7.2 draft lifecycle → Task 5 (`status` handling); the compose transition is Plan 2. §10 migration-failure recovery → Task 8 Step 2. §11 fixtures requirement → Task 7. Month attribution across midnight → Task 6 (`computeBudgetStatus` joins on `dates.occurredOn`).

**Deliberately deferred to later plans:** photos and the media pipeline (Plan 2), receipt export and money modes (Plan 3), the five analytics panels and tier computation (Plan 4). No task in this plan references them.

**Type consistency.** `AppDatabase` is defined once in Task 3 and used unchanged in Tasks 4–8. `Clock` is defined in Task 4 and consumed in Tasks 5–7. `captureStop(db, clock, input)` keeps the same argument order in Tasks 5, 6 and 7. `StopKind` is defined in Task 5 and imported in Tasks 5 and 7. `formatMoney`/`money` from Task 2 are used in Task 8 with the signatures defined in Task 2.
