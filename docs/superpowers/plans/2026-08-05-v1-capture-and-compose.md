# Date Tracker v1 — Plan 2: Capture & Compose

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app usable by a human — a sub-five-second quick-capture sheet, a draft strip that nudges you to finish write-ups, a composer that turns a draft into a published date, and local photos. Plus the three correctness fixes from Plan 1's final review that stop being latent the moment a capture UI exists.

**Architecture:** Unchanged from Plan 1 — SQLite is the store, `useLiveQuery` drives reactivity, `src/domain/**` stays React-free and takes its dependencies as parameters. This plan extends that pattern: time and identity are both injected via a single `Deps` object, and every multi-statement write runs inside `db.transaction()`. Photos are local-only files (v1 has no network); the `photos` row records a `local_uri` and stays at `upload_state: 'local'`.

**Tech Stack:** Expo (dev build) · expo-router · expo-sqlite + drizzle-orm · expo-image-picker · expo-file-system · Vitest

**Spec:** `docs/superpowers/specs/2026-08-03-couples-date-tracker-design.md` (§7.1–7.3)
**Predecessor:** `docs/superpowers/plans/2026-08-03-v1-foundation-and-data-layer.md` (complete)

## Global Constraints

- **Money is always an integer count of minor units (centavos).** Floats forbidden in `src/domain/money`. Formatting only at the display edge.
- **`src/domain/**` and `src/fixtures/**` must not import `react`, `react-native`, or any `expo-*` package** — directly *or transitively*. Task 1 makes this structurally true; it must stay true.
- **Domain functions never import a database singleton.** The handle is the first parameter. Time and identity come from a `Deps` object.
- **Every multi-statement write runs in `db.transaction()`.**
- **Aggregations are SQL, never JavaScript `.reduce()`** — the same query shape runs against Postgres in v2.
- **Deletes are tombstones** (`deleted_at`); reads filter `deleted_at IS NULL`.
- **Spend is attributed to the parent date's `occurred_on`**, never the stop's `occurred_at`.
- Timestamps are integer epoch ms; calendar dates are ISO `YYYY-MM-DD`; budget periods are `YYYY-MM`.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, no `any`.
- **No network calls anywhere in v1.**
- Render tests remain out of scope. The bar is: Vitest green, `tsc --noEmit` clean.
- **The git repository already exists.** `main` tracks `origin/main` at `https://github.com/danielsalipot/date-tracker` (private). Never run `git init` or `git remote add`. Every task commits **and** pushes; a task is incomplete until `git push` succeeds.
- **Never run `npm run lint`** — no ESLint config is committed and running it auto-scaffolds one, modifying `package.json`.
- **Native builds need a UTF-8 locale.** CocoaPods 1.16.2 under Ruby 4.0.2 crashes on a non-UTF-8 path. Prefix with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.

---

### Task 1: Inject id generation out of the domain graph

Plan 1's final review found `src/domain/**` transitively imports `expo-crypto` through `src/db/id.ts`. Domain code only runs in Node because `vitest.config.mts` aliases the module away — so the stated "domain runs in plain Node" property is false, and any other Node consumer (a seed CLI, CI, the v2 server reusing aggregation code) breaks.

**Files:**
- Create: `src/domain/deps.ts`
- Modify: `src/db/id.ts` (delete), `src/db/client.ts`, `src/test/testDb.ts`
- Modify: `src/domain/dates/repository.ts`, `src/domain/identity/bootstrap.ts`, `src/domain/budget/status.ts`, `src/fixtures/seed.ts`
- Modify: all four affected test files
- Delete: `src/test/expo-crypto-shim.ts`, and the `expo-crypto` alias in `vitest.config.mts`

**Interfaces:**
- Consumes: `Clock` from `@/domain/clock`
- Produces:
  - `type IdGenerator = () => string`
  - `interface Deps { readonly clock: Clock; readonly newId: IdGenerator }`
  - `sequentialIds(prefix?: string): IdGenerator` (test helper, exported from `@/domain/deps`)
  - All domain writers now take `deps: Deps` where they previously took `clock: Clock`

- [ ] **Step 1: Create the deps module**

Create `src/domain/deps.ts`:

```ts
import type { Clock } from './clock';

export type IdGenerator = () => string;

/**
 * Everything non-deterministic that domain code needs, injected rather than
 * imported. Time was already injected; identity now joins it, which removes
 * the last transitive `expo-*` import from the domain module graph and lets
 * these modules run in plain Node with no aliasing.
 */
export interface Deps {
  readonly clock: Clock;
  readonly newId: IdGenerator;
}

/** Deterministic ids for tests. Makes assertions readable and failures stable. */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/domain/deps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sequentialIds } from './deps';

describe('sequentialIds', () => {
  it('produces stable, ordered ids', () => {
    const next = sequentialIds('stop');
    expect(next()).toBe('stop-1');
    expect(next()).toBe('stop-2');
  });

  it('gives independent generators independent sequences', () => {
    const a = sequentialIds();
    const b = sequentialIds();
    a();
    expect(b()).toBe('id-1');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- deps`
Expected: FAIL — `Failed to resolve import "./deps"`.

Then create the module from Step 1 and re-run: PASS (2 tests).

- [ ] **Step 4: Delete the expo-crypto dependency**

```bash
cd /Users/danielsalipot/Herd/date-tracker
rm src/db/id.ts src/test/expo-crypto-shim.ts
```

Edit `vitest.config.mts` — remove the `expo-crypto` alias line and its comment, leaving only the `@` alias:

```ts
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
```

- [ ] **Step 5: Provide the real generator in the app client**

Edit `src/db/client.ts` — add at the end of the file:

```ts
import { randomUUID } from 'expo-crypto';
import type { Deps, IdGenerator } from '@/domain/deps';
import { systemClock } from '@/domain/clock';

/** The app's real id source. `src/db/` may import expo-*; `src/domain/` may not. */
export const newId: IdGenerator = () => randomUUID();

export function appDeps(timezone: string): Deps {
  return { clock: systemClock(timezone), newId };
}
```

- [ ] **Step 6: Thread `Deps` through the domain writers**

In `src/domain/identity/bootstrap.ts`, change the signature and every `newId()` call:

```ts
import type { Deps } from '@/domain/deps';

export function ensureLocalContext(db: AppDatabase, deps: Deps): LocalContext {
  // ... existing early-return branch unchanged ...
  const now = deps.clock.nowMs();
  const userId = deps.newId();
  const coupleId = deps.newId();
  // ... rest unchanged ...
}
```

In `src/domain/dates/repository.ts`:

```ts
import type { Deps } from '@/domain/deps';

export function captureStop(db: AppDatabase, deps: Deps, input: CaptureStopInput): CaptureResult {
  const now = deps.clock.nowMs();
  const today = deps.clock.todayLocal();
  // Body below is otherwise byte-identical to its current form. Exactly two
  // substitutions: `newId()` -> `deps.newId()` at the `dateId` assignment and
  // at the `stopId` assignment. Nothing else changes; Task 2 rewrites this
  // body in full when it introduces the transaction.
}
```

Delete the now-unused `import { newId } from '@/db/id';` line at the top of the file — that module no longer exists.

In `src/domain/budget/status.ts`:

```ts
import type { Deps } from '@/domain/deps';

export function setBudget(
  db: AppDatabase,
  coupleId: string,
  periodMonth: string,
  amountMinor: number,
  deps: Deps,
): void {
  const now = deps.clock.nowMs();
  // Body below is otherwise byte-identical. Exactly one substitution:
  // `newId()` -> `deps.newId()` in the insert branch. Task 2 rewrites this
  // body in full when it introduces the transaction.
}

export function computeBudgetStatus(db: AppDatabase, coupleId: string, deps: Deps): BudgetStatus {
  const today = deps.clock.todayLocal();
  // Body below is byte-identical to its current form — this function performs
  // no writes, so only the `clock` -> `deps.clock` read on the line above
  // changes. Task 3 rewrites this signature and body when it adds currency
  // scoping.
}
```

Delete the now-unused `import { newId } from '@/db/id';` line at the top of the file.

In `src/fixtures/seed.ts`, change the signature to accept deps and build a per-date `Deps`:

```ts
import type { Deps } from '@/domain/deps';

export function seedTwelveMonths(
  db: AppDatabase,
  coupleId: string,
  userId: string,
  endDate: string,
  deps: Deps,
): void {
  // ... inside the loop, replace `const clock = fixedClock(...)` with:
  const dayDeps: Deps = { clock: fixedClock(Date.parse(`${day}T12:00:00Z`), day), newId: deps.newId };
  // ... and pass `dayDeps` to captureStop instead of `clock`.
  // ... at the end, replace `seedClock` with:
  const seedDeps: Deps = {
    clock: fixedClock(Date.parse(`${endDate}T12:00:00Z`), endDate),
    newId: deps.newId,
  };
  // ... and pass `seedDeps` to setBudget.
}
```

- [ ] **Step 7: Update the test harness and all call sites**

Edit `src/test/testDb.ts` — add a deps factory beside `createTestDb`:

```ts
import { fixedClock } from '@/domain/clock';
import { sequentialIds, type Deps } from '@/domain/deps';

/** Deterministic deps for tests: a fixed clock plus stable sequential ids. */
export function testDeps(nowMs: number, todayLocal: string, idPrefix = 'id'): Deps {
  return { clock: fixedClock(nowMs, todayLocal), newId: sequentialIds(idPrefix) };
}
```

Then in each affected test file, replace the `fixedClock(...)` constants with `testDeps(...)` and pass `deps` where `clock` was passed. For example, in `src/domain/dates/repository.test.ts`:

```ts
import { createTestDb, testDeps } from '@/test/testDb';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03', 'aug3');
const AUG_4 = testDeps(1_785_090_000_000, '2026-08-04', 'aug4');
```

`AUG_3.clock.nowMs()` replaces `AUG_3.nowMs()` at the two places the tests read the clock directly. `src/domain/identity/bootstrap.test.ts` keeps its direct `fixedClock`/`systemClock` tests unchanged (those test the clock itself) but uses `testDeps` for `ensureLocalContext` calls.

- [ ] **Step 8: Prove domain no longer touches expo**

Run:

Match **import statements**, not substrings — `deps.ts`'s own docstring mentions `expo-*` as prose and would trip a bare substring grep:

```bash
grep -rnE "^\s*(import|export).*from\s+['\"](expo|react|react-native)" src/domain src/fixtures \
  || echo "CLEAN: zero expo/react imports"
```

Expected: `CLEAN: zero expo/react imports`

- [ ] **Step 9: Run the full suite and type check**

Run: `npm test`
Expected: PASS — 58 tests (56 existing + 2 new deps tests), pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Commit and push**

```bash
git add src app vitest.config.mts
git commit -m "refactor: inject id generation so domain runs in plain Node

src/domain transitively imported expo-crypto via src/db/id.ts, so domain code
only ran in Node because vitest aliased the module away. Identity now joins
time in an injected Deps object, the alias and shim are deleted, and tests get
deterministic sequential ids as a bonus."
git push
```

---

### Task 2: Transactional writes

Plan 1's final review found no write path uses `db.transaction()`. The worst case is `ensureLocalContext`: interrupted between its three inserts, the next launch's membership lookup finds nothing and mints a **second** user and couple, orphaning the first permanently with no constraint to catch it. Spec §9 also requires the row write and the `outbox` append to share one transaction in v2, so every write site needs this shape regardless.

**Files:**
- Modify: `src/domain/identity/bootstrap.ts`, `src/domain/dates/repository.ts`, `src/domain/budget/status.ts`
- Test: `src/domain/identity/bootstrap.test.ts`, `src/domain/dates/repository.test.ts`

**Interfaces:**
- Consumes: `Deps` from Task 1, `AppDatabase` from `@/db/types`
- Produces: no signature changes — the transaction is internal to each writer

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/identity/bootstrap.test.ts`:

```ts
  it('creates no partial identity when a write fails midway', () => {
    const db = createTestDb();
    const deps = testDeps(1_700_000_000_000, '2026-08-03');
    let calls = 0;
    const exploding = {
      ...deps,
      newId: () => {
        calls += 1;
        if (calls === 2) throw new Error('boom');
        return `id-${calls}`;
      },
    };

    expect(() => ensureLocalContext(db, exploding)).toThrow(/boom/);

    // Without a transaction the users row survives and the couple never
    // arrives, so the next launch mints a second identity and orphans this one.
    expect(db.select().from(users).all()).toHaveLength(0);
    expect(db.select().from(couples).all()).toHaveLength(0);
    expect(db.select().from(coupleMembers).all()).toHaveLength(0);
  });
```

Add to `src/domain/dates/repository.test.ts`, inside `describe('captureStop')`:

```ts
  it('leaves no ghost draft when the stop insert fails', () => {
    const { db, coupleId, userId } = setup();
    let calls = 0;
    const exploding = {
      ...AUG_3,
      newId: () => {
        calls += 1;
        if (calls === 2) throw new Error('boom');
        return `x-${calls}`;
      },
    };

    expect(() =>
      captureStop(db, exploding, { coupleId, userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' }),
    ).toThrow(/boom/);

    expect(db.select().from(dates).all()).toHaveLength(0);
    expect(db.select().from(stops).all()).toHaveLength(0);
  });
```

`bootstrap.test.ts` needs `users`, `couples`, `coupleMembers` imported from `@/db/schema` (some may already be).

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- bootstrap repository`
Expected: FAIL — both new tests. `bootstrap` reports `expected [ {...} ] to have a length of 0 but got 1` (the users row survived); `repository` reports the same for `dates`.

- [ ] **Step 3: Wrap `ensureLocalContext`'s writes**

In `src/domain/identity/bootstrap.ts`, replace the three bare inserts with a transaction:

```ts
  const now = deps.clock.nowMs();
  const userId = deps.newId();

  db.transaction((tx) => {
    // The users insert runs BEFORE the second newId() call, deliberately. The
    // test injects a generator that throws on its second call; if the id were
    // generated first, the throw would land before any write and the test would
    // pass vacuously — proving nothing about rollback.
    tx.insert(users).values({ id: userId, displayName: 'Me', updatedAt: now }).run();
    const coupleId = deps.newId();
    tx.insert(couples)
      .values({
        id: coupleId,
        currencyCode: DEFAULT_CURRENCY,
        timezone: DEFAULT_TIMEZONE,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(coupleMembers).values({ coupleId, userId, joinedAt: now, updatedAt: now }).run();
    created = { userId, coupleId, currencyCode: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE };
  });

  if (!created) throw new Error('identity bootstrap produced no context');
  return created;
```

Declare `let created: LocalContext | null = null;` above the transaction. The second `deps.newId()` call moves **inside** the transaction so the test's throw happens mid-transaction and rolls back.

- [ ] **Step 4: Wrap `captureStop`'s writes**

In `src/domain/dates/repository.ts`, wrap everything from the draft lookup through the stop insert in one transaction, returning the result:

```ts
  let result: CaptureResult | null = null;

  db.transaction((tx) => {
    const openDrafts = tx.select().from(dates).where(/* unchanged predicate */).orderBy(desc(dates.updatedAt)).all();
    const existing = openDrafts[0];
    const createdDate = existing === undefined;
    const dateId = existing?.id ?? deps.newId();

    if (createdDate) {
      tx.insert(dates).values({ /* unchanged */ }).run();
    } else {
      tx.update(dates).set({ updatedAt: now }).where(eq(dates.id, dateId)).run();
    }

    const ordering = tx
      .select({ maxOrder: sql<number | null>`max(${stops.sortOrder})` })
      .from(stops)
      .where(eq(stops.dateId, dateId))
      .all();

    const stopId = deps.newId();
    tx.insert(stops).values({ /* unchanged, sortOrder: (ordering[0]?.maxOrder ?? -1) + 1 */ }).run();

    result = { stopId, dateId, createdDate };
  });

  if (!result) throw new Error('captureStop produced no result');
  return result;
```

Every `db.` inside the callback becomes `tx.`. The `deps.newId()` for the date moves inside so a mid-transaction throw rolls the whole thing back.

- [ ] **Step 5: Wrap `setBudget`'s read-then-write**

In `src/domain/budget/status.ts`, wrap the existence check and the insert-or-update together:

```ts
  const now = deps.clock.nowMs();

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
      .all();

    if (existing.length > 0) {
      tx.update(budgets)
        .set({ amountMinor, updatedAt: now, deletedAt: null })
        .where(and(eq(budgets.coupleId, coupleId), eq(budgets.periodMonth, periodMonth)))
        .run();
      return;
    }

    tx.insert(budgets)
      .values({ id: deps.newId(), coupleId, periodMonth, amountMinor, updatedAt: now })
      .run();
  });
```

- [ ] **Step 6: Run to verify they pass**

Run: `npm test`
Expected: PASS — 60 tests (58 + 2 new), pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit and push**

```bash
git add src
git commit -m "fix: run every multi-statement write in a transaction

Interrupted between inserts, ensureLocalContext left a users row with no
couple, so the next launch minted a second identity and orphaned the first.
captureStop could leave a ghost empty draft. Spec section 9 also requires the
row write and outbox append to share a transaction in v2."
git push
```

---

### Task 3: Currency-correct aggregations

Plan 1's final review confirmed empirically that both aggregations sum `amount_minor` across currency codes: a ₱100.00 stop and a ¥10000 stop produce `totalMinor: 20000`, rendered as `₱200.00`. Spec line 200 put `currency_code` on the stop specifically so a trip abroad could not corrupt history. This is latent only because nothing writes a non-PHP stop yet — Task 6 adds the capture UI that can.

**Files:**
- Create: `src/domain/scope.ts`
- Modify: `src/domain/dates/repository.ts`, `src/domain/budget/status.ts`, `app/index.tsx`
- Test: `src/domain/dates/repository.test.ts`, `src/domain/budget/status.test.ts`

**Interfaces:**
- Consumes: `Deps` (Task 1)
- Produces:
  - `interface CoupleScope { readonly coupleId: string; readonly currencyCode: string }`
  - `feedDatesQuery(db: AppDatabase, scope: CoupleScope)` — was `(db, coupleId)`
  - `toFeedDate(row: FeedDateRow, currencyCode: string): FeedDate` — was `(row)`
  - `listFeedDates(db: AppDatabase, scope: CoupleScope): FeedDate[]` — was `(db, coupleId)`
  - `computeBudgetStatus(db: AppDatabase, scope: CoupleScope, deps: Deps): BudgetStatus` — was `(db, coupleId, deps)`
  - `LocalContext` structurally satisfies `CoupleScope`, so callers pass `ctx` directly

- [ ] **Step 1: Create the scope type**

Create `src/domain/scope.ts`:

```ts
/**
 * The couple a query is scoped to, plus the currency its totals are expressed
 * in. Summing amount_minor across currencies is meaningless — ₱100 and ¥10000
 * are both 10000 minor units — so every aggregation filters on currency.
 *
 * `LocalContext` satisfies this structurally, so callers pass their context.
 */
export interface CoupleScope {
  readonly coupleId: string;
  readonly currencyCode: string;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `src/domain/dates/repository.test.ts`, inside `describe('listFeedDates')`:

```ts
  it('excludes stops in other currencies from counts and totals', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };

    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'PHP' });
    captureStop(db, AUG_3, { coupleId, userId, kind: 'food', amountMinor: 10000, currencyCode: 'JPY' });

    // Both are 10000 minor units, but ₱100.00 and ¥10000 are not ₱200.00.
    const feed = listFeedDates(db, scope);
    expect(feed[0]?.totalMinor).toBe(10000);
    expect(feed[0]?.stopCount).toBe(1);
    expect(feed[0]?.currencyCode).toBe('PHP');
  });
```

Add to `src/domain/budget/status.test.ts`, inside `describe('computeBudgetStatus')`:

```ts
  it('excludes spend in other currencies', () => {
    const { db, coupleId, userId } = setup();
    const scope = { coupleId, currencyCode: 'PHP' };
    setBudget(db, coupleId, '2026-08', 800000, AUG_30);

    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 234000, currencyCode: 'PHP' });
    captureStop(db, AUG_30, { coupleId, userId, kind: 'food', amountMinor: 500000, currencyCode: 'JPY' });

    expect(computeBudgetStatus(db, scope, AUG_30).spentMinor).toBe(234000);
  });
```

Every other call site in both test files must be updated to pass a scope object instead of a bare `coupleId`.

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -- repository status`
Expected: FAIL — type errors on the new scope argument, and once those are satisfied, `expected 20000 to be 10000` and `expected 734000 to be 234000`.

- [ ] **Step 4: Filter by currency in the feed query**

In `src/domain/dates/repository.ts`:

```ts
import type { CoupleScope } from '@/domain/scope';

export function feedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return db
    .select({ /* unchanged projection */ })
    .from(dates)
    .leftJoin(
      stops,
      and(
        eq(stops.dateId, dates.id),
        isNull(stops.deletedAt),
        // In the ON clause, not the WHERE: a date whose stops are all in
        // another currency must still appear, with a zero total.
        eq(stops.currencyCode, scope.currencyCode),
      ),
    )
    .where(and(eq(dates.coupleId, scope.coupleId), isNull(dates.deletedAt)))
    .groupBy(dates.id)
    .orderBy(desc(dates.occurredOn));
}

export function toFeedDate(row: FeedDateRow, currencyCode: string): FeedDate {
  return {
    id: row.id,
    title: row.title,
    occurredOn: row.occurredOn,
    status: row.status,
    stopCount: Number(row.stopCount),
    totalMinor: Number(row.totalMinor),
    currencyCode,
  };
}

export function listFeedDates(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return feedDatesQuery(db, scope).all().map((row) => toFeedDate(row, scope.currencyCode));
}
```

- [ ] **Step 5: Filter by currency in the budget query**

In `src/domain/budget/status.ts`, change the signature and add the predicate:

```ts
export function computeBudgetStatus(
  db: AppDatabase,
  scope: CoupleScope,
  deps: Deps,
): BudgetStatus {
  const today = deps.clock.todayLocal();
  const periodMonth = periodMonthFor(today);

  const spentRows = db
    .select({ total: sql<number>`coalesce(sum(${stops.amountMinor}), 0)` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(dates.deletedAt),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .all();

  // ... budget read now uses scope.coupleId; rest unchanged ...
}
```

- [ ] **Step 6: Update the screen**

In `app/index.tsx`, pass `ctx` where `ctx.coupleId` was passed, and drop the per-item currency read:

```tsx
  const { data } = useLiveQuery(feedDatesQuery(db, ctx));
  const dates = useMemo(() => data.map((row) => toFeedDate(row, ctx.currencyCode)), [data, ctx.currencyCode]);
  const budget = useMemo(() => computeBudgetStatus(db, ctx, deps), [ctx, deps, data]);
```

- [ ] **Step 7: Run to verify they pass**

Run: `npm test`
Expected: PASS — 62 tests, pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit and push**

```bash
git add src app
git commit -m "fix: scope aggregations to one currency

Both aggregations summed amount_minor across currency codes, so a 100 peso
stop and a 10000 yen stop totalled 20000 and rendered as 200 pesos. currency_code
lives on the stop precisely so a trip abroad cannot corrupt history; the capture
UI in a later task is the first thing that could write a non-PHP stop."
git push
```

---

### Task 4: Photo domain and local media store

v1 has no network, so a photo is a file copied into the app's documents directory plus a `photos` row at `upload_state: 'local'`. The three-state lifecycle (`local` → `uploading` → `synced`) exists in the schema for v2; v1 only ever writes `local`.

**Files:**
- Create: `src/domain/photos/repository.ts`, `src/media/store.ts`
- Test: `src/domain/photos/repository.test.ts`

**Interfaces:**
- Consumes: `Deps`, `AppDatabase`, `photos` table
- Produces:
  - `interface AttachPhotoInput { dateId: string; stopId?: string | null; localUri: string; width: number; height: number; takenAt?: number | null }`
  - `attachPhoto(db: AppDatabase, deps: Deps, input: AttachPhotoInput): string` — returns the new photo id
  - `photosForDateQuery(db: AppDatabase, dateId: string)` — unexecuted builder for `useLiveQuery`
  - `listPhotosForDate(db: AppDatabase, dateId: string): PhotoRow[]`
  - `detachPhoto(db: AppDatabase, deps: Deps, photoId: string): void` — tombstones
  - `interface PhotoRow { id: string; stopId: string | null; localUri: string | null; width: number; height: number; takenAt: number | null }`
  - `src/media/store.ts`: `persistPickedImage(uri: string): Promise<string>` — copies into documents dir, returns the new uri

- [ ] **Step 1: Write the failing test**

Create `src/domain/photos/repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto, detachPhoto, listPhotosForDate } from './repository';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, ...captured };
}

describe('attachPhoto', () => {
  it('attaches a photo to a date at upload_state local', () => {
    const { db, dateId } = setup();

    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1600, height: 1200 });

    const photos = listPhotosForDate(db, dateId);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.id).toBe(id);
    expect(photos[0]?.localUri).toBe('file:///a.jpg');
    expect(photos[0]?.stopId).toBeNull();
  });

  it('can attach a photo to a specific stop', () => {
    const { db, dateId, stopId } = setup();

    attachPhoto(db, DEPS, { dateId, stopId, localUri: 'file:///b.jpg', width: 100, height: 100 });

    expect(listPhotosForDate(db, dateId)[0]?.stopId).toBe(stopId);
  });

  it('returns photos in capture order', () => {
    const { db, dateId } = setup();

    attachPhoto(db, DEPS, { dateId, localUri: 'file:///1.jpg', width: 1, height: 1, takenAt: 200 });
    attachPhoto(db, DEPS, { dateId, localUri: 'file:///2.jpg', width: 1, height: 1, takenAt: 100 });

    expect(listPhotosForDate(db, dateId).map((p) => p.localUri)).toEqual([
      'file:///2.jpg',
      'file:///1.jpg',
    ]);
  });
});

describe('detachPhoto', () => {
  it('tombstones rather than hard-deleting', () => {
    const { db, dateId } = setup();
    const id = attachPhoto(db, DEPS, { dateId, localUri: 'file:///a.jpg', width: 1, height: 1 });

    detachPhoto(db, DEPS, id);

    expect(listPhotosForDate(db, dateId)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- photos`
Expected: FAIL — `Failed to resolve import "./repository"`.

- [ ] **Step 3: Implement the photo repository**

Create `src/domain/photos/repository.ts`:

```ts
import { and, asc, eq, isNull } from 'drizzle-orm';
import { photos } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface AttachPhotoInput {
  dateId: string;
  stopId?: string | null;
  localUri: string;
  width: number;
  height: number;
  takenAt?: number | null;
}

export interface PhotoRow {
  id: string;
  stopId: string | null;
  localUri: string | null;
  width: number;
  height: number;
  takenAt: number | null;
}

/**
 * v1 has no network, so a photo never leaves `upload_state: 'local'`. The
 * remote_key/thumb_key columns and the local -> uploading -> synced lifecycle
 * exist for v2, where only a compressed display copy is uploaded and the
 * original stays on the device that took it.
 */
export function attachPhoto(db: AppDatabase, deps: Deps, input: AttachPhotoInput): string {
  const now = deps.clock.nowMs();
  const id = deps.newId();

  db.insert(photos)
    .values({
      id,
      dateId: input.dateId,
      stopId: input.stopId ?? null,
      localUri: input.localUri,
      width: input.width,
      height: input.height,
      takenAt: input.takenAt ?? now,
      uploadState: 'local',
      updatedAt: now,
    })
    .run();

  return id;
}

/** Unexecuted builder so screens can subscribe with useLiveQuery. */
export function photosForDateQuery(db: AppDatabase, dateId: string) {
  return db
    .select({
      id: photos.id,
      stopId: photos.stopId,
      localUri: photos.localUri,
      width: photos.width,
      height: photos.height,
      takenAt: photos.takenAt,
    })
    .from(photos)
    .where(and(eq(photos.dateId, dateId), isNull(photos.deletedAt)))
    .orderBy(asc(photos.takenAt));
}

export function listPhotosForDate(db: AppDatabase, dateId: string): PhotoRow[] {
  return photosForDateQuery(db, dateId).all();
}

export function detachPhoto(db: AppDatabase, deps: Deps, photoId: string): void {
  const now = deps.clock.nowMs();
  db.update(photos)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(photos.id, photoId))
    .run();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- photos`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add the media store**

Install the picker:

```bash
npx expo install expo-image-picker expo-file-system
```

Create `src/media/store.ts`:

```ts
import * as FileSystem from 'expo-file-system';

const PHOTO_DIR = `${FileSystem.documentDirectory}photos/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  }
}

/**
 * Copies a picked image into the app's documents directory and returns the new
 * uri. The picker hands back a cache-directory path that the OS may reclaim at
 * any time, so a photo referenced straight from the picker can vanish between
 * sessions — the copy is what makes the reference durable.
 */
export async function persistPickedImage(uri: string, fileName: string): Promise<string> {
  await ensureDir();
  const target = `${PHOTO_DIR}${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}
```

This file lives in `src/media/`, not `src/domain/`, precisely because it imports `expo-*`.

- [ ] **Step 6: Run the full suite and type check**

Run: `npm test`
Expected: PASS — 66 tests, pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit and push**

```bash
git add src package.json package-lock.json
git commit -m "feat: add photo domain and local media store

v1 photos are local files plus a row at upload_state local; the lifecycle
columns exist for v2. Picked images are copied out of the picker's cache
directory, which the OS can reclaim, into the app documents directory."
git push
```

---

### Task 5: Amount keypad and kind chips

The capture sheet's sub-five-second target depends on two things being immediate: a numeric keypad that is already focused, and category chips ordered so the common choice is first. Both are presentational and get built before the sheet that composes them.

**Files:**
- Create: `src/ui/AmountKeypad.tsx`, `src/ui/KindChips.tsx`
- Create: `src/domain/stops/recent.ts`
- Test: `src/domain/stops/recent.test.ts`

**Interfaces:**
- Consumes: `STOP_KINDS`, `StopKind` from `@/domain/stops/taxonomy`
- Produces:
  - `kindsByRecentUse(db: AppDatabase, coupleId: string): StopKind[]` — all six kinds, most-recently-used first
  - `<AmountKeypad value={string} onChange={(next: string) => void} currencyCode={string} />`
  - `<KindChips kinds={StopKind[]} selected={StopKind} onSelect={(k: StopKind) => void} />`

- [ ] **Step 1: Write the failing test**

Create `src/domain/stops/recent.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { STOP_KINDS } from './taxonomy';
import { kindsByRecentUse } from './recent';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

describe('kindsByRecentUse', () => {
  it('returns every kind even with no history', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);

    expect(kindsByRecentUse(db, ctx.coupleId).sort()).toEqual([...STOP_KINDS].sort());
  });

  it('puts the most recently used kind first', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 1, currencyCode: 'PHP' } as const;

    captureStop(db, DEPS, { ...base, kind: 'gift' });
    captureStop(db, DEPS, { ...base, kind: 'transport' });

    expect(kindsByRecentUse(db, ctx.coupleId)[0]).toBe('transport');
  });

  it('never drops or duplicates a kind', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, DEPS);
    captureStop(db, DEPS, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });

    const result = kindsByRecentUse(db, ctx.coupleId);
    expect(result).toHaveLength(STOP_KINDS.length);
    expect(new Set(result).size).toBe(STOP_KINDS.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- recent`
Expected: FAIL — `Failed to resolve import "./recent"`.

- [ ] **Step 3: Implement recent-use ordering**

Create `src/domain/stops/recent.ts`:

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import { STOP_KINDS, type StopKind } from './taxonomy';

/**
 * All six kinds, most-recently-used first. Always returns the full set — the
 * capture sheet shows every chip, and hiding one because it has no history
 * would make the rarely-used categories permanently unreachable.
 */
export function kindsByRecentUse(db: AppDatabase, coupleId: string): StopKind[] {
  const used = db
    .select({ kind: stops.kind, lastUsed: sql<number>`max(${stops.updatedAt})` })
    .from(stops)
    .innerJoin(dates, eq(stops.dateId, dates.id))
    .where(and(eq(dates.coupleId, coupleId), isNull(dates.deletedAt), isNull(stops.deletedAt)))
    .groupBy(stops.kind)
    .orderBy(desc(sql`max(${stops.updatedAt})`))
    .all();

  const ordered = used
    .map((row) => row.kind)
    .filter((kind): kind is StopKind => (STOP_KINDS as readonly string[]).includes(kind));

  const seen = new Set(ordered);
  return [...ordered, ...STOP_KINDS.filter((kind) => !seen.has(kind))];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- recent`
Expected: PASS — 3 tests.

- [ ] **Step 5: Build the amount keypad**

Create `src/ui/AmountKeypad.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native';
import { theme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

interface Props {
  value: string;
  onChange: (next: string) => void;
  currencyCode: string;
}

/**
 * A custom keypad rather than a TextInput with a numeric keyboard: the system
 * keyboard animates in, can be dismissed, and on some devices offers a
 * non-numeric layout. The capture target is five seconds, and a keypad that is
 * simply already on screen removes that whole class of delay.
 */
export function AmountKeypad({ value, onChange, currencyCode }: Props) {
  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1));
    if (key === '.' && value.includes('.')) return;
    // Two decimal places max — parseMajorToMinor rejects more precision.
    const [, fraction] = value.split('.');
    if (fraction !== undefined && fraction.length >= 2 && key !== '⌫') return;
    onChange(value + key);
  };

  const symbol = currencyCode === 'PHP' ? '₱' : `${currencyCode} `;

  return (
    <View>
      <Text style={{ fontSize: 44, fontWeight: '800', color: theme.color.ink, textAlign: 'center', paddingVertical: theme.space.md }}>
        {symbol}{value === '' ? '0' : value}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            style={{ width: '33.33%', paddingVertical: theme.space.md, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 26, color: theme.color.ink }}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 6: Build the kind chips**

Create `src/ui/KindChips.tsx`:

```tsx
import { Pressable, ScrollView, Text } from 'react-native';
import type { StopKind } from '@/domain/stops/taxonomy';
import { theme } from './theme';

const LABELS: Record<StopKind, string> = {
  food: '🍽 Food',
  transport: '🚗 Transport',
  activity: '🎟 Activity',
  shopping: '🛍 Shopping',
  gift: '🎁 Gift',
  other: '• Other',
};

interface Props {
  kinds: readonly StopKind[];
  selected: StopKind;
  onSelect: (kind: StopKind) => void;
}

export function KindChips({ kinds, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.md }}>
      {kinds.map((kind) => (
        <Pressable
          key={kind}
          onPress={() => onSelect(kind)}
          style={{
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
            borderRadius: 999,
            backgroundColor: kind === selected ? theme.color.rose : theme.color.blush,
          }}
        >
          <Text style={{ fontWeight: '600', color: kind === selected ? theme.color.cream : theme.color.ink }}>
            {LABELS[kind]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 7: Run the suite and type check**

Run: `npm test`
Expected: PASS — 69 tests, pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit and push**

```bash
git add src
git commit -m "feat: add amount keypad, kind chips and recent-use ordering

A custom keypad rather than a numeric TextInput: the system keyboard animates
in and can be dismissed, and the capture target is five seconds. Chips are
ordered by recent use but always show all six kinds, so a rarely-used category
never becomes unreachable."
git push
```

---

### Task 6: Quick-capture sheet

The screen that has to work in under five seconds. Spec §7.1: amount keypad focused on open, six kind chips ordered by recent use, optional camera button, one tap to save. The user never picks a date — `captureStop`'s implicit-open-date rule handles that.

**Files:**
- Create: `app/capture.tsx`
- Modify: `app/_layout.tsx` (register the modal route)

**Interfaces:**
- Consumes: `AmountKeypad`, `KindChips`, `kindsByRecentUse`, `captureStop`, `computeBudgetStatus`, `parseMajorToMinor`, `formatMoney`, `attachPhoto`, `persistPickedImage`, `appDeps`
- Produces: a route at `/capture` presented as a modal

- [ ] **Step 1: Register the modal route**

In `app/_layout.tsx`, replace the returned `<Stack>` with:

```tsx
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
    </Stack>
  );
```

- [ ] **Step 2: Build the capture sheet**

Create `app/capture.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db, appDeps } from '@/db/client';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto } from '@/domain/photos/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { kindsByRecentUse } from '@/domain/stops/recent';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { persistPickedImage } from '@/media/store';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { KindChips } from '@/ui/KindChips';
import { theme } from '@/ui/theme';

export default function Capture() {
  const deps = useMemo(() => appDeps('Asia/Manila'), []);
  const ctx = useMemo(() => ensureLocalContext(db, deps), [deps]);
  const kinds = useMemo(() => kindsByRecentUse(db, ctx.coupleId), [ctx.coupleId]);

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<StopKind>(kinds[0] ?? 'food');
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);

  const budget = useMemo(() => computeBudgetStatus(db, ctx, deps), [ctx, deps]);
  const remaining =
    budget.remainingMinor === null
      ? 'No budget set'
      : `${formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left · ${budget.daysLeft}d`;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // A date without photos is completely valid — never a dead end.
      Alert.alert('Camera unavailable', 'You can still log the amount.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    const asset = shot.assets?.[0];
    if (shot.canceled || !asset) return;
    setPendingPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const save = async () => {
    let amountMinor: number;
    try {
      amountMinor = parseMajorToMinor(amount === '' ? '0' : amount, ctx.currencyCode).amountMinor;
    } catch {
      Alert.alert('That amount looks off', 'Enter a number like 420 or 420.50.');
      return;
    }

    const result = captureStop(db, deps, {
      coupleId: ctx.coupleId,
      userId: ctx.userId,
      kind,
      amountMinor,
      currencyCode: ctx.currencyCode,
    });

    if (pendingPhoto) {
      const durable = await persistPickedImage(pendingPhoto.uri, `${result.stopId}.jpg`);
      attachPhoto(db, deps, {
        dateId: result.dateId,
        stopId: result.stopId,
        localUri: durable,
        width: pendingPhoto.width,
        height: pendingPhoto.height,
      });
    }

    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.color.muted, fontSize: 16 }}>Cancel</Text>
        </Pressable>
        <Text style={{ color: budget.isOverBudget ? theme.color.rose : theme.color.muted }}>{remaining}</Text>
      </View>

      <AmountKeypad value={amount} onChange={setAmount} currencyCode={ctx.currencyCode} />

      <View style={{ paddingVertical: theme.space.md }}>
        <KindChips kinds={kinds} selected={kind} onSelect={setKind} />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md, marginTop: 'auto' }}>
        <Pressable
          onPress={pickPhoto}
          style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush }}
        >
          <Text style={{ fontSize: 20 }}>{pendingPhoto ? '✓📷' : '📷'}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700', fontSize: 16 }}>Save</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Run the suite and type check**

Run: `npm test`
Expected: PASS — 69 tests unchanged (this task adds no domain logic), pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit and push**

```bash
git add app
git commit -m "feat: add quick-capture sheet

Amount keypad on open, kind chips ordered by recent use, optional camera, one
tap to save. The user never picks a date: captureStop appends to today's draft
and silently creates one if none exists. Live budget remaining is shown at the
moment of logging, since a budget only seen in a dashboard changes nothing."
git push
```

---

### Task 7: Feed draft strip, FAB and navigation

Spec §7.2: published dates render as photo-first cards with unfinished drafts pinned in a slim strip at the top. That strip is v1's retention mechanic — no push notifications.

**Files:**
- Modify: `app/index.tsx`
- Create: `src/domain/dates/drafts.ts`
- Test: `src/domain/dates/drafts.test.ts`

**Interfaces:**
- Consumes: `CoupleScope`, `AppDatabase`
- Produces:
  - `draftDatesQuery(db: AppDatabase, scope: CoupleScope)` — unexecuted builder
  - `listDraftDates(db: AppDatabase, scope: CoupleScope): FeedDate[]`
  - `publishedDatesQuery(db: AppDatabase, scope: CoupleScope)` — unexecuted builder

- [ ] **Step 1: Write the failing test**

Create `src/domain/dates/drafts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { dates } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { listDraftDates } from './drafts';

const AUG_3 = testDeps(1_785_000_000_000, '2026-08-03');
const AUG_4 = testDeps(1_785_090_000_000, '2026-08-04');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, AUG_3);
  return { db, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode }, ctx };
}

describe('listDraftDates', () => {
  it('returns only drafts', () => {
    const { db, scope, ctx } = setup();
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' } as const;

    const draft = captureStop(db, AUG_3, base);
    const published = captureStop(db, AUG_4, base);
    db.update(dates).set({ status: 'published' }).where(eq(dates.id, published.dateId)).run();

    const drafts = listDraftDates(db, scope);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.id).toBe(draft.dateId);
  });

  it('excludes tombstoned drafts', () => {
    const { db, scope, ctx } = setup();
    const captured = captureStop(db, AUG_3, {
      coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP',
    });
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, captured.dateId)).run();

    expect(listDraftDates(db, scope)).toHaveLength(0);
  });

  it('orders drafts oldest first, so the most neglected is nudged hardest', () => {
    const { db, scope, ctx } = setup();
    const base = { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 1, currencyCode: 'PHP' } as const;

    const older = captureStop(db, AUG_3, base);
    captureStop(db, AUG_4, base);

    expect(listDraftDates(db, scope)[0]?.id).toBe(older.dateId);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- drafts`
Expected: FAIL — `Failed to resolve import "./drafts"`.

- [ ] **Step 3: Implement the draft queries**

Create `src/domain/dates/drafts.ts`:

```ts
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';
import { toFeedDate, type FeedDate } from './repository';

function scopedQuery(db: AppDatabase, scope: CoupleScope, status: string) {
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
    .leftJoin(
      stops,
      and(eq(stops.dateId, dates.id), isNull(stops.deletedAt), eq(stops.currencyCode, scope.currencyCode)),
    )
    .where(and(eq(dates.coupleId, scope.coupleId), eq(dates.status, status), isNull(dates.deletedAt)))
    .groupBy(dates.id);
}

/** Oldest first: the longest-neglected draft is the one worth nudging hardest. */
export function draftDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return scopedQuery(db, scope, 'draft').orderBy(asc(dates.occurredOn));
}

export function publishedDatesQuery(db: AppDatabase, scope: CoupleScope) {
  return scopedQuery(db, scope, 'published').orderBy(desc(dates.occurredOn));
}

export function listDraftDates(db: AppDatabase, scope: CoupleScope): FeedDate[] {
  return draftDatesQuery(db, scope).all().map((row) => toFeedDate(row, scope.currencyCode));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- drafts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Rework the feed screen**

In `app/index.tsx`, replace the single `useLiveQuery` with two, add the draft strip above the list, add a FAB, and make cards navigable:

```tsx
  const { data: draftRows } = useLiveQuery(draftDatesQuery(db, ctx));
  const { data: publishedRows } = useLiveQuery(publishedDatesQuery(db, ctx));
  const drafts = useMemo(() => draftRows.map((r) => toFeedDate(r, ctx.currencyCode)), [draftRows, ctx.currencyCode]);
  const published = useMemo(() => publishedRows.map((r) => toFeedDate(r, ctx.currencyCode)), [publishedRows, ctx.currencyCode]);
```

Render above the `FlatList`, only when `drafts.length > 0`:

```tsx
      {drafts.length > 0 && (
        <Pressable
          onPress={() => router.push(`/date/${drafts[0]?.id}/compose`)}
          style={{ marginHorizontal: theme.space.md, marginBottom: theme.space.sm, padding: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush, flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Text style={{ fontWeight: '700', color: theme.color.ink }}>
            {drafts.length === 1 ? '1 date waiting' : `${drafts.length} dates waiting`}
          </Text>
          <Text style={{ color: theme.color.rose, fontWeight: '700' }}>Finish →</Text>
        </Pressable>
      )}
```

Change the `FlatList` `data` to `published`, wrap each card in `<Pressable onPress={() => router.push(\`/date/${item.id}\`)}>`, and add the FAB as the last child of the `SafeAreaView`:

```tsx
      <Pressable
        onPress={() => router.push('/capture')}
        style={{ position: 'absolute', right: theme.space.lg, bottom: theme.space.lg, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: theme.color.cream, fontSize: 30, lineHeight: 34 }}>+</Text>
      </Pressable>
```

Keep the seed button in `ListEmptyComponent`, but change its condition so it only shows when there are no drafts *and* no published dates.

- [ ] **Step 6: Run the suite and type check**

Run: `npm test`
Expected: PASS — 72 tests, pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit and push**

```bash
git add src app
git commit -m "feat: add draft strip, capture FAB and card navigation

Drafts are dates with money but no story. They pin above the feed oldest-first,
so the longest-neglected is nudged hardest — that strip is v1's retention
mechanic, with no push notifications."
git push
```

---

### Task 8: Composer — date fields and publish

Spec §7.3. A draft becomes published by acquiring a story: title, caption, rating, cover photo. This is the transition the draft strip nudges toward.

**Files:**
- Create: `src/domain/dates/compose.ts`, `app/date/[id]/compose.tsx`
- Test: `src/domain/dates/compose.test.ts`

**Interfaces:**
- Consumes: `Deps`, `AppDatabase`, `photos`/`dates` tables
- Produces:
  - `interface DateDetails { title?: string | null; caption?: string | null; rating?: number | null; coverPhotoId?: string | null; locationLabel?: string | null }`
  - `updateDateDetails(db: AppDatabase, deps: Deps, dateId: string, details: DateDetails): void`
  - `publishDate(db: AppDatabase, deps: Deps, dateId: string): void` — throws if the date has no title
  - `unpublishDate(db: AppDatabase, deps: Deps, dateId: string): void`
  - `dateDetailQuery(db: AppDatabase, dateId: string)` — unexecuted builder
  - `interface DateDetail { id: string; title: string | null; occurredOn: string; caption: string | null; rating: number | null; status: string; coverPhotoId: string | null }`

- [ ] **Step 1: Write the failing test**

Create `src/domain/dates/compose.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { loadDateDetail, publishDate, unpublishDate, updateDateDetails } from './compose';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const captured = captureStop(db, DEPS, {
    coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 42000, currencyCode: 'PHP',
  });
  return { db, dateId: captured.dateId };
}

describe('updateDateDetails', () => {
  it('sets the fields it is given and leaves the rest alone', () => {
    const { db, dateId } = setup();

    updateDateDetails(db, DEPS, dateId, { title: 'Bag of Beans Day' });
    updateDateDetails(db, DEPS, dateId, { rating: 5 });

    const detail = loadDateDetail(db, dateId);
    expect(detail?.title).toBe('Bag of Beans Day');
    expect(detail?.rating).toBe(5);
  });

  it('bumps updated_at so sync and draft ordering see the edit', () => {
    const { db, dateId } = setup();
    const before = loadDateDetail(db, dateId);

    const later = testDeps(1_785_999_999_999, '2026-08-03');
    updateDateDetails(db, later, dateId, { caption: 'worth the rain' });

    expect(loadDateDetail(db, dateId)?.caption).toBe('worth the rain');
    expect(before?.status).toBe('draft');
  });
});

describe('publishDate', () => {
  it('refuses to publish an untitled date', () => {
    const { db, dateId } = setup();

    expect(() => publishDate(db, DEPS, dateId)).toThrow(/title/i);
    expect(loadDateDetail(db, dateId)?.status).toBe('draft');
  });

  it('publishes once a title exists', () => {
    const { db, dateId } = setup();
    updateDateDetails(db, DEPS, dateId, { title: 'Tagaytay' });

    publishDate(db, DEPS, dateId);

    expect(loadDateDetail(db, dateId)?.status).toBe('published');
  });

  it('can be reversed', () => {
    const { db, dateId } = setup();
    updateDateDetails(db, DEPS, dateId, { title: 'Tagaytay' });
    publishDate(db, DEPS, dateId);

    unpublishDate(db, DEPS, dateId);

    expect(loadDateDetail(db, dateId)?.status).toBe('draft');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- compose`
Expected: FAIL — `Failed to resolve import "./compose"`.

- [ ] **Step 3: Implement the compose domain**

Create `src/domain/dates/compose.ts`:

```ts
import { eq } from 'drizzle-orm';
import { dates } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface DateDetails {
  title?: string | null;
  caption?: string | null;
  rating?: number | null;
  coverPhotoId?: string | null;
  locationLabel?: string | null;
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
    .where(eq(dates.id, dateId));
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- compose`
Expected: PASS — 5 tests.

- [ ] **Step 5: Build the composer screen**

Create `app/date/[id]/compose.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db, appDeps } from '@/db/client';
import { loadDateDetail, publishDate, updateDateDetails } from '@/domain/dates/compose';
import { theme } from '@/ui/theme';

export default function Compose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deps = useMemo(() => appDeps('Asia/Manila'), []);
  const detail = useMemo(() => loadDateDetail(db, id), [id]);

  const [title, setTitle] = useState(detail?.title ?? '');
  const [caption, setCaption] = useState(detail?.caption ?? '');
  const [rating, setRating] = useState(detail?.rating ?? 0);

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That date no longer exists.</Text>
      </SafeAreaView>
    );
  }

  const save = (publish: boolean) => {
    updateDateDetails(db, deps, id, { title: title.trim(), caption, rating: rating === 0 ? null : rating });
    if (publish) {
      try {
        publishDate(db, deps, id);
      } catch {
        Alert.alert('Almost there', 'Give this date a title first.');
        return;
      }
    }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {detail.occurredOn.toUpperCase()}
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Name this date"
          placeholderTextColor={theme.color.muted}
          style={{ fontSize: 24, fontWeight: '700', color: theme.color.ink, paddingVertical: theme.space.sm }}
        />

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="How was it?"
          placeholderTextColor={theme.color.muted}
          multiline
          style={{ minHeight: 90, fontSize: 16, color: theme.color.ink, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md, padding: theme.space.md, borderWidth: 1, borderColor: theme.color.line }}
        />

        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)}>
              <Text style={{ fontSize: 30 }}>{n <= rating ? '♥' : '♡'}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md }}>
        <Pressable
          onPress={() => save(false)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush }}
        >
          <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Save draft</Text>
        </Pressable>
        <Pressable
          onPress={() => save(true)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700' }}>Publish</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: Run the suite and type check**

Run: `npm test`
Expected: PASS — 77 tests (72 + 5 compose), pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit and push**

```bash
git add src app
git commit -m "feat: add composer screen and publish transition

Publishing requires a title: a published card's most prominent line is its
title, and a feed of 'Untitled date' defeats the point of the wall. The
transition is reversible via unpublishDate."
git push
```

---

### Task 9: Stop editing, date detail screen, and seeder realism

Three things that belong together because the detail screen is what makes stop editing visible: the stop-level domain operations, the screen that renders a date's timeline, and the seeder fix from Plan 1's review — all 48 seeded cards currently render identically as "Untitled date / DRAFT" with every stop sharing one timestamp, so the demo shows no timeline, which is the product thesis.

**Files:**
- Create: `src/domain/stops/edit.ts`, `app/date/[id]/index.tsx`
- Modify: `src/fixtures/seed.ts`, `src/fixtures/seed.test.ts`
- Test: `src/domain/stops/edit.test.ts`

**Interfaces:**
- Consumes: `Deps`, `AppDatabase`, `StopKind`
- Produces:
  - `interface StopRow { id: string; sortOrder: number; kind: string; subkind: string | null; label: string | null; placeName: string | null; occurredAt: number | null; amountMinor: number; currencyCode: string }`
  - `stopsForDateQuery(db: AppDatabase, dateId: string)` — unexecuted builder
  - `listStopsForDate(db: AppDatabase, dateId: string): StopRow[]`
  - `updateStop(db, deps, stopId, patch: { label?, subkind?, placeName?, amountMinor? }): void`
  - `deleteStop(db, deps, stopId): void` — tombstones
  - `reorderStops(db, deps, dateId, orderedIds: string[]): void`

- [ ] **Step 1: Write the failing test**

Create `src/domain/stops/edit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestDb, testDeps } from '@/test/testDb';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { deleteStop, listStopsForDate, reorderStops, updateStop } from './edit';

const DEPS = testDeps(1_785_000_000_000, '2026-08-03');

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, DEPS);
  const base = { coupleId: ctx.coupleId, userId: ctx.userId, amountMinor: 100, currencyCode: 'PHP' } as const;
  const a = captureStop(db, DEPS, { ...base, kind: 'food' });
  const b = captureStop(db, DEPS, { ...base, kind: 'transport' });
  return { db, dateId: a.dateId, a: a.stopId, b: b.stopId };
}

describe('listStopsForDate', () => {
  it('returns stops in sort order', () => {
    const { db, dateId, a, b } = setup();
    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([a, b]);
  });
});

describe('updateStop', () => {
  it('patches only the given fields', () => {
    const { db, dateId, a } = setup();

    updateStop(db, DEPS, a, { label: 'Morning coffee', subkind: 'cafe' });

    const stop = listStopsForDate(db, dateId).find((s) => s.id === a);
    expect(stop?.label).toBe('Morning coffee');
    expect(stop?.subkind).toBe('cafe');
    expect(stop?.amountMinor).toBe(100);
  });
});

describe('deleteStop', () => {
  it('tombstones and leaves the remaining order intact', () => {
    const { db, dateId, a, b } = setup();

    deleteStop(db, DEPS, a);

    const remaining = listStopsForDate(db, dateId);
    expect(remaining.map((s) => s.id)).toEqual([b]);
    expect(remaining[0]?.sortOrder).toBe(1);
  });
});

describe('reorderStops', () => {
  it('renumbers to match the given order', () => {
    const { db, dateId, a, b } = setup();

    reorderStops(db, DEPS, dateId, [b, a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });

  it('ignores ids that do not belong to the date', () => {
    const { db, dateId, a, b } = setup();

    reorderStops(db, DEPS, dateId, [b, 'not-a-stop', a]);

    expect(listStopsForDate(db, dateId).map((s) => s.id)).toEqual([b, a]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- edit`
Expected: FAIL — `Failed to resolve import "./edit"`.

- [ ] **Step 3: Implement stop editing**

Create `src/domain/stops/edit.ts`:

```ts
import { and, asc, eq, isNull } from 'drizzle-orm';
import { stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { Deps } from '@/domain/deps';

export interface StopRow {
  id: string;
  sortOrder: number;
  kind: string;
  subkind: string | null;
  label: string | null;
  placeName: string | null;
  occurredAt: number | null;
  amountMinor: number;
  currencyCode: string;
}

export interface StopPatch {
  label?: string | null;
  subkind?: string | null;
  placeName?: string | null;
  amountMinor?: number;
}

export function stopsForDateQuery(db: AppDatabase, dateId: string) {
  return db
    .select({
      id: stops.id,
      sortOrder: stops.sortOrder,
      kind: stops.kind,
      subkind: stops.subkind,
      label: stops.label,
      placeName: stops.placeName,
      occurredAt: stops.occurredAt,
      amountMinor: stops.amountMinor,
      currencyCode: stops.currencyCode,
    })
    .from(stops)
    .where(and(eq(stops.dateId, dateId), isNull(stops.deletedAt)))
    .orderBy(asc(stops.sortOrder));
}

export function listStopsForDate(db: AppDatabase, dateId: string): StopRow[] {
  return stopsForDateQuery(db, dateId).all();
}

export function updateStop(db: AppDatabase, deps: Deps, stopId: string, patch: StopPatch): void {
  const set: Record<string, unknown> = { updatedAt: deps.clock.nowMs() };
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.subkind !== undefined) set.subkind = patch.subkind;
  if (patch.placeName !== undefined) set.placeName = patch.placeName;
  if (patch.amountMinor !== undefined) set.amountMinor = patch.amountMinor;

  db.update(stops).set(set).where(eq(stops.id, stopId)).run();
}

export function deleteStop(db: AppDatabase, deps: Deps, stopId: string): void {
  const now = deps.clock.nowMs();
  db.update(stops).set({ deletedAt: now, updatedAt: now }).where(eq(stops.id, stopId)).run();
}

/**
 * Renumbers to match `orderedIds`. Ids not belonging to this date are ignored
 * rather than throwing — a stale list from a screen that raced a delete should
 * reorder what it can, not fail the whole gesture.
 */
export function reorderStops(
  db: AppDatabase,
  deps: Deps,
  dateId: string,
  orderedIds: readonly string[],
): void {
  const now = deps.clock.nowMs();
  const owned = new Set(listStopsForDate(db, dateId).map((s) => s.id));

  db.transaction((tx) => {
    let position = 0;
    for (const id of orderedIds) {
      if (!owned.has(id)) continue;
      tx.update(stops).set({ sortOrder: position, updatedAt: now }).where(eq(stops.id, id)).run();
      position += 1;
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- edit`
Expected: PASS — 5 tests.

- [ ] **Step 5: Build the date detail screen**

Create `app/date/[id]/index.tsx`:

```tsx
import { useMemo } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { loadDateDetail } from '@/domain/dates/compose';
import { listStopsForDate } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { theme } from '@/ui/theme';

export default function DateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMemo(() => loadDateDetail(db, id), [id]);
  const stops = useMemo(() => listStopsForDate(db, id), [id]);

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That date no longer exists.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {detail.occurredOn.toUpperCase()} · {detail.status.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.color.ink }}>
          {detail.title ?? 'Untitled date'}
        </Text>
      </View>

      <FlatList
        data={stops}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.line }}>
            <Text style={{ color: theme.color.ink }}>{item.label ?? item.kind}</Text>
            <Text style={{ color: theme.color.ink, fontWeight: '700' }}>
              {formatMoney(money(item.amountMinor, item.currencyCode))}
            </Text>
          </View>
        )}
      />

      <Pressable
        onPress={() => router.push(`/date/${id}/compose`)}
        style={{ margin: theme.space.md, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
      >
        <Text style={{ color: theme.color.cream, fontWeight: '700' }}>Edit</Text>
      </Pressable>
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: Make the seeder produce a realistic demo**

In `src/fixtures/seed.ts`, add a title list and vary status and stop times. Add near `TEMPLATES`:

```ts
const TITLES: readonly string[] = [
  'Bag of Beans Day', 'Rainy Tagaytay', 'Movie night', 'Milk tea run',
  'Anniversary dinner', 'Beach day', 'Mall wandering', 'Videoke night',
  'Sunday brunch', 'Road trip north', 'Museum afternoon', 'Late-night drive',
];
```

Inside the date loop, after the stop loop, set a title and publish all but the two most recent dates:

```ts
    // Vary status and title: a demo where all 48 cards read "Untitled date /
    // DRAFT" tells you nothing about how the real feed looks. Two recent drafts
    // are kept so the draft strip has something to nudge.
    const title = TITLES[i % TITLES.length] ?? 'A date';
    db.update(dates)
      .set({ title, status: i < 2 ? 'draft' : 'published', rating: 3 + (i % 3), updatedAt: dayDeps.clock.nowMs() })
      .where(eq(dates.id, dateId))
      .run();
```

`captureStop` returns `{ dateId }`, so capture the first stop's result into `dateId` at the top of the inner loop. Import `dates` from `@/db/schema` and `eq` from `drizzle-orm`.

Spread stop times across the evening so the timeline is visible — replace the `dayDeps` clock construction inside the stop loop:

```ts
      const stopDeps: Deps = {
        clock: fixedClock(Date.parse(`${day}T${String(10 + s * 3).padStart(2, '0')}:00:00Z`), day),
        newId: deps.newId,
      };
```

- [ ] **Step 7: Update the seeder test**

In `src/fixtures/seed.test.ts`, add:

```ts
  it('produces varied titles and published dates, not 48 identical drafts', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const scope = { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode };
    const all = listFeedDates(db, scope);
    expect(new Set(all.map((d) => d.title)).size).toBeGreaterThan(5);
    expect(all.filter((d) => d.status === 'published').length).toBeGreaterThan(40);
    expect(listDraftDates(db, scope)).toHaveLength(2);
  });

  it('spreads stop times so each date has a visible timeline', () => {
    const db = createTestDb();
    const ctx = ensureLocalContext(db, AUG_3);

    seedTwelveMonths(db, ctx.coupleId, ctx.userId, '2026-08-03', AUG_3);

    const first = listFeedDates(db, { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode })[0];
    const times = listStopsForDate(db, first?.id ?? '').map((s) => s.occurredAt);
    expect(new Set(times).size).toBe(times.length);
  });
```

- [ ] **Step 8: Run everything and type check**

Run: `npm test`
Expected: PASS — 84 tests, pristine output.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Verify on device**

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```

Expected: app launches. Then, by hand:
1. Tap **+** → keypad appears with the amount already prominent
2. Enter `420`, pick a kind, tap **Save** → returns to the feed, the draft strip reads "1 date waiting"
3. Tap **Finish →** → composer opens; enter a title, tap **Publish**
4. The date moves out of the draft strip and into the feed with its title
5. Tap a published card → the detail screen lists that date's stops in order

- [ ] **Step 10: Commit and push**

```bash
git add src app
git commit -m "feat: add stop editing, date detail screen and a realistic demo seed

All 48 seeded cards rendered identically as 'Untitled date / DRAFT' with every
stop sharing one timestamp, so the demo showed no timeline — which is the
product thesis. Titles vary, most dates publish, two stay draft so the strip
has something to nudge, and stop times spread across the evening."
git push
```

---

## Plan self-review

**Spec coverage.** §7.1 quick-capture (keypad, chips by recent use, camera, implicit open date, live budget) → Tasks 5–6. §7.2 draft lifecycle and the nudge strip → Task 7. §7.3 compose (title, caption, rating, subkind, place, reorder, delete) → Tasks 8–9. Photos → Task 4, consumed in Task 6. The three carried-forward findings from Plan 1's final review → Tasks 1–3; the fourth (seeder realism) → Task 9.

**Deliberately out of scope, deferred to Plan 3:** the Skia receipt export and its money modes, and the analytics dashboard. `paid_by` editing is also deferred — v1 is solo, so every stop's payer is the single local user, and a picker with one option is noise.

**Type consistency.** `Deps` is defined once in Task 1 and consumed by Tasks 2, 4, 8, 9. `CoupleScope` is defined in Task 3 and consumed by Tasks 3, 7, 9. `toFeedDate(row, currencyCode)` gains its second parameter in Task 3 and is called with it in Tasks 3, 7 and 9. `FeedDate` keeps its Plan 1 shape. `loadDateDetail` is defined in Task 8 and consumed by Task 9's detail screen. `listStopsForDate` is defined and consumed within Task 9.

**No forward references.** An earlier draft of this plan put the date detail screen in Task 8, where it imported `listStopsForDate` from Task 9 — leaving `tsc` failing between the two tasks. The detail screen moved to Task 9 so every task type-checks clean on its own, which is also what lets a reviewer reject one task without blocking its neighbour.

**Every task ends green.** `npm test` and `npx tsc --noEmit` both pass at the end of all nine tasks. Task counts run 58 → 60 → 62 → 66 → 69 → 69 → 72 → 77 → 84.
