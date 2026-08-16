# Analytics Dashboard Implementation Plan (v1, Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One screen that answers "what did we spend, and where can we save" — the payoff the whole capture loop exists to produce.

**Architecture:** Five aggregations, each a single SQL query over `dates ⋈ stops` scoped to the couple and excluding tombstones, living in `src/domain/analytics/`. The screen is a thin renderer over their typed results plus a month stepper. Bars are plain Views with percentage widths — no charting dependency.

**Tech Stack:** Expo SDK 57 dev build, expo-router (gaining a tab group), drizzle-orm + expo-sqlite (better-sqlite3 in tests), vitest.

## Global Constraints

- `src/domain/**` imports nothing from `react`, `react-native`, or `expo-*`. It runs in plain Node under vitest.
- **Analytics are written as SQL, never JavaScript `.reduce()`** (spec §6, boundary rule 2). The same `GROUP BY kind, month` must run unchanged against Postgres in v2; logic living in JS would have to be duplicated server-side or force shipping every row to the client forever. Assembling a *dense* series from sparse SQL rows is not aggregation and is allowed — see Task 3.
- Money is always integer minor units. Never floats, never `parseFloat`. Averages round to whole minor units.
- Deletes are tombstones (`deleted_at`); every read filters them, on **both** `dates` and `stops`.
- **Spend is attributed to the month of the parent date's `occurred_on`**, never the stop's own timestamp — so a date running past midnight counts entirely in one month and "this date cost X" agrees between the receipt and the dashboard. This rule already governs `computeBudgetStatus`; every query here must follow it.
- Every aggregation filters on `stops.currency_code = scope.currencyCode`. ₱100 and ¥10000 are both `10000` minor units; summing across currencies is meaningless.
- Any query joining a tombstoneable table puts `isNull(x.deletedAt)` in the **ON clause**, not the `WHERE`, whenever the join is a `leftJoin`. (On an `innerJoin` the two are equivalent; prefer the ON clause anyway for consistency.)
- `useLiveQuery` subscribes to a query's **FROM table only**. A screen reacting to two tables uses two live queries.
- **Every screen must be escapable.** Pushed screens get a header with a back button; tabs are reachable from the tab bar. A screen you can only leave by force-quitting is a defect, not a polish item — this shipped once already and survived five reviews.
- Colours and spacing come from `src/ui/theme.ts`. No hardcoded hex except `'#FFFFFF'` for surfaces.
- Test runner: `npx vitest run` (**142 passing** at the start of this plan). Type check: `npx tsc --noEmit`.
- **Never run `npm run lint`** — no ESLint config is committed and the command scaffolds one and rewrites `package.json`.
- If vitest fails with `NODE_MODULE_VERSION`, run `npm rebuild better-sqlite3` — a known environment issue on this machine, not a code problem.
- The dev build needs Metro running (`npx expo start --dev-client`) or it shows "No script URL provided". That is not a code bug.
- Do not add npm dependencies. Bars are Views with percentage widths.

## What "one screen without scrolling" means here

Spec §13 criterion 3 says the dashboard answers *"what did we spend last month and on what"* on one screen without scrolling. That names sections 1 and 2 specifically. **Those two must fit above the fold on a 390×844pt phone**; trend, per-date average and top places may sit below it. Do not compress all five into one viewport at the cost of legibility — the criterion is about the question, not the pixel count.

## Deliberately not in this plan

- **No settings tab.** Spec §6's module layout lists one, but nothing in §8 needs it and there is no setting the dashboard depends on. Adding a tab with one screen that does nothing is worse than two honest tabs.
- **No budget editing UI.** `setBudget` exists and is tested, but the dashboard *reports* against a budget; letting the user set one is a separate flow, and §8 does not ask for it. The bar renders a "no budget set" state instead.
- **No date-range picker.** §8 says the period selector is a month stepper. A stepper it is.

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/analytics/period.ts` *(create)* | Month-key arithmetic: step a month, list a trailing window |
| `src/domain/analytics/spend.ts` *(create)* | Sections 1–2: month totals vs budget, spend by kind, subkind drill |
| `src/domain/analytics/trend.ts` *(create)* | Sections 3–4: dense 12-month series, per-date averages |
| `src/domain/analytics/places.ts` *(create)* | Section 5: top places by spend |
| `src/domain/budget/status.ts` *(modify)* | Generalise to an arbitrary month; keep the current-month entry point |
| `src/ui/Bar.tsx` *(create)* | One horizontal bar: label, value, proportional fill |
| `app/(tabs)/_layout.tsx` *(create)* | Two-tab shell |
| `app/(tabs)/index.tsx` *(moved from `app/index.tsx`)* | The feed, unchanged apart from its path |
| `app/(tabs)/dashboard.tsx` *(create)* | The dashboard screen |
| `app/_layout.tsx` *(modify)* | Root Stack points at the tab group |

---

## Task 1: Month arithmetic and a month-scoped budget status

**Files:**
- Create: `src/domain/analytics/period.ts`, `src/domain/analytics/period.test.ts`
- Modify: `src/domain/budget/status.ts`
- Test: `src/domain/budget/status.test.ts`

**Interfaces:**
- Consumes: `periodMonthFor`, `daysRemainingIn` from `@/domain/budget/period`; `CoupleScope`; `AppDatabase`.
- Produces:
  - `export function shiftMonth(periodMonth: string, delta: number): string`
  - `export function trailingMonths(endMonth: string, count: number): string[]`
  - `export function budgetStatusFor(db, scope, periodMonth: string, todayLocal: string): BudgetStatus`

  `computeBudgetStatus(db, scope, deps)` keeps its exact current signature and behaviour, now implemented in terms of `budgetStatusFor`. Consumed by Tasks 3, 4 and 6.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/analytics/period.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shiftMonth, trailingMonths } from './period';

describe('shiftMonth', () => {
  it('steps forward and back within a year', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
  });

  it('crosses the year boundary in both directions', () => {
    // The stepper is the only way to reach last December, so an off-by-one
    // here silently hides a month of history.
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('steps a whole year', () => {
    expect(shiftMonth('2026-08', -12)).toBe('2025-08');
    expect(shiftMonth('2026-08', 12)).toBe('2027-08');
  });

  it('zero-pads single-digit months', () => {
    // Month keys are compared as strings against substr(occurred_on, 1, 7),
    // so '2026-9' would match nothing at all.
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-02', -1)).toBe('2026-01');
  });

  it('rejects a malformed month key', () => {
    expect(() => shiftMonth('2026-8', 1)).toThrow(/YYYY-MM/);
    expect(() => shiftMonth('not-a-month', 1)).toThrow(/YYYY-MM/);
  });
});

describe('trailingMonths', () => {
  it('returns the window oldest first, ending on the given month', () => {
    expect(trailingMonths('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('returns exactly the requested count', () => {
    expect(trailingMonths('2026-08', 12)).toHaveLength(12);
    expect(trailingMonths('2026-08', 12)[0]).toBe('2025-09');
    expect(trailingMonths('2026-08', 12)[11]).toBe('2026-08');
  });

  it('returns an empty window for a non-positive count', () => {
    expect(trailingMonths('2026-08', 0)).toEqual([]);
  });
});
```

Then add to `src/domain/budget/status.test.ts` (read the file first and reuse its `setup()`):

```ts
it('reports a month other than the current one', () => {
  const { db, scope, ctx } = setup();
  // Spend in July while "today" is in August.
  captureStop(db, testDeps(Date.parse('2026-07-10T12:00:00Z'), '2026-07-10', 'jul'), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
  });

  const july = budgetStatusFor(db, scope, '2026-07', '2026-08-14');

  expect(july.periodMonth).toBe('2026-07');
  expect(july.spentMinor).toBe(30000);
  // daysLeft is only meaningful for the month containing today.
  expect(july.daysLeft).toBe(0);
});

it('does not count another month\'s spend', () => {
  const { db, scope, ctx } = setup();
  captureStop(db, testDeps(Date.parse('2026-07-10T12:00:00Z'), '2026-07-10', 'jul'), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: 'food', amountMinor: 30000, currencyCode: 'PHP',
  });

  expect(budgetStatusFor(db, scope, '2026-08', '2026-08-14').spentMinor).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/analytics/period.test.ts src/domain/budget/status.test.ts`
Expected: FAIL — `./period` does not exist, and `budgetStatusFor` is not exported.

- [ ] **Step 3: Write `src/domain/analytics/period.ts`**

```ts
const PERIOD_MONTH = /^\d{4}-\d{2}$/;

function assertPeriodMonth(periodMonth: string): void {
  if (!PERIOD_MONTH.test(periodMonth)) {
    throw new Error(`expected a period month YYYY-MM, received "${periodMonth}"`);
  }
}

/**
 * Month arithmetic on the key itself rather than via Date. Period keys are
 * compared as strings against `substr(occurred_on, 1, 7)`, so the only thing
 * that matters is producing a correctly zero-padded YYYY-MM — and going
 * through Date invites a timezone shifting the answer by a month at the edges.
 */
export function shiftMonth(periodMonth: string, delta: number): string {
  assertPeriodMonth(periodMonth);
  const [yearText = '', monthText = ''] = periodMonth.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  const zeroBased = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = zeroBased - shiftedYear * 12 + 1;

  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/** `count` months ending at `endMonth` inclusive, oldest first. */
export function trailingMonths(endMonth: string, count: number): string[] {
  assertPeriodMonth(endMonth);
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - (count - 1)));
}
```

- [ ] **Step 4: Generalise the budget status**

In `src/domain/budget/status.ts`, extract the body of `computeBudgetStatus` into a month-parameterised function and make the existing one delegate. **Do not change `computeBudgetStatus`'s signature** — `app/index.tsx` and `app/capture.tsx` both call it and neither should need editing.

```ts
/**
 * Budget status for an arbitrary month. `todayLocal` is still needed because
 * `daysLeft` is only meaningful for the month containing today; for any other
 * month `daysRemainingIn` correctly returns 0.
 */
export function budgetStatusFor(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
  todayLocal: string,
): BudgetStatus {
  // ...the existing body, with `periodMonth` taken as a parameter instead of
  // derived from `today`, and `daysRemainingIn(periodMonth, todayLocal)`.
}

export function computeBudgetStatus(db: AppDatabase, scope: CoupleScope, deps: Deps): BudgetStatus {
  const today = deps.clock.todayLocal();
  return budgetStatusFor(db, scope, periodMonthFor(today), today);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, **152** tests.

Run: `npx tsc --noEmit`
Expected: exit 0. `app/index.tsx` and `app/capture.tsx` must still compile untouched — if either needs editing, `computeBudgetStatus`'s signature changed and that is a defect.

- [ ] **Step 6: Mutation-check**

1. In `shiftMonth`, drop the `padStart(2, '0')` on the month.
   Expected: `zero-pads single-digit months` fails — `'2026-9'` where `'2026-09'` was expected.
2. In `trailingMonths`, change `i - (count - 1)` to `i - count`.
   Expected: `returns the window oldest first` fails, the window shifted a month early.
3. In `budgetStatusFor`, replace the `periodMonth` parameter with `periodMonthFor(todayLocal)`.
   Expected: `reports a month other than the current one` fails — `spentMinor` comes back 0.

Restore each; paste the failures into your report.

- [ ] **Step 7: Commit**

```bash
git add src/domain/analytics/period.ts src/domain/analytics/period.test.ts src/domain/budget/status.ts src/domain/budget/status.test.ts
git commit -m "feat: add month arithmetic and a month-scoped budget status"
```

---

## Task 2: Spend by kind, drillable to subkind

**Files:**
- Create: `src/domain/analytics/spend.ts`, `src/domain/analytics/spend.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SpendSlice {
    readonly key: string;        // kind, or subkind when drilled
    readonly totalMinor: number;
    readonly stopCount: number;
  }
  export function spendByKind(db: AppDatabase, scope: CoupleScope, periodMonth: string): SpendSlice[];
  export function spendBySubkind(db, scope, periodMonth: string, kind: string): SpendSlice[];
  ```
  Both ranked by `totalMinor` descending. Consumed by Task 6.

**A stop with no subkind still counts.** Spec §5 makes subkind optional and never required, so dropping unlabelled stops from the drill-down would make the numbers disagree with the parent bar. They group under the key `'unsorted'`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/analytics/spend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, testDeps } from '@/test/testDb';
import { couples, dates, stops } from '@/db/schema';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { updateStop } from '@/domain/stops/edit';
import { spendByKind, spendBySubkind } from './spend';

const AUG = '2026-08';

function setup() {
  const db = createTestDb();
  const ctx = ensureLocalContext(db, testDeps(Date.parse('2026-08-14T12:00:00Z'), '2026-08-14', 'boot'));
  return { db, ctx, scope: { coupleId: ctx.coupleId, currencyCode: ctx.currencyCode } };
}

function spend(db: ReturnType<typeof createTestDb>, ctx: { coupleId: string; userId: string },
               kind: string, amountMinor: number, day: string, prefix: string) {
  return captureStop(db, testDeps(Date.parse(`${day}T12:00:00Z`), day, prefix), {
    coupleId: ctx.coupleId, userId: ctx.userId,
    kind: kind as 'food', amountMinor, currencyCode: 'PHP',
  });
}

describe('spendByKind', () => {
  it('ranks kinds by total spend, descending', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 50000, '2026-08-01', 'a');
    spend(db, ctx, 'transport', 8000, '2026-08-02', 'b');
    spend(db, ctx, 'activity', 120000, '2026-08-03', 'c');

    const slices = spendByKind(db, scope, AUG);

    expect(slices.map((s) => s.key)).toEqual(['activity', 'food', 'transport']);
    expect(slices.map((s) => s.totalMinor)).toEqual([120000, 50000, 8000]);
  });

  it('sums repeat spending in the same kind and counts the stops', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 20000, '2026-08-02', 'b');

    const slices = spendByKind(db, scope, AUG);

    expect(slices).toHaveLength(1);
    expect(slices[0]).toEqual({ key: 'food', totalMinor: 50000, stopCount: 2 });
  });

  it('counts only the selected month', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 99000, '2026-07-31', 'b');

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });

  it('excludes tombstoned stops and tombstoned dates', () => {
    const { db, ctx, scope } = setup();
    const kept = spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    const deadStop = spend(db, ctx, 'food', 70000, '2026-08-02', 'b');
    const deadDate = spend(db, ctx, 'food', 90000, '2026-08-03', 'c');
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, deadStop.stopId)).run();
    db.update(dates).set({ deletedAt: 1 }).where(eq(dates.id, deadDate.dateId)).run();

    const slices = spendByKind(db, scope, AUG);

    expect(slices[0]?.totalMinor).toBe(30000);
    expect(slices[0]?.stopCount).toBe(1);
    expect(kept.stopId).toBeDefined();
  });

  it("ignores another couple's spending", () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    db.insert(couples).values({
      id: 'them', currencyCode: 'PHP', timezone: 'Asia/Manila', createdAt: 1, updatedAt: 1,
    }).run();
    db.insert(dates).values({
      id: 'their-date', coupleId: 'them', occurredOn: '2026-08-05', status: 'published',
      createdBy: ctx.userId, updatedAt: 1,
    }).run();
    db.insert(stops).values({
      id: 'their-stop', dateId: 'their-date', sortOrder: 0, kind: 'food',
      amountMinor: 500000, currencyCode: 'PHP', updatedAt: 1,
    }).run();

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });

  it('excludes another currency', () => {
    const { db, ctx, scope } = setup();
    const phpStop = spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    db.insert(stops).values({
      id: 'yen', dateId: phpStop.dateId, sortOrder: 8, kind: 'food',
      amountMinor: 900000, currencyCode: 'JPY', updatedAt: 1,
    }).run();

    expect(spendByKind(db, scope, AUG)[0]?.totalMinor).toBe(30000);
  });
});

describe('spendBySubkind', () => {
  it('breaks one kind down by subkind, descending', () => {
    const { db, ctx, scope } = setup();
    const cafe = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    const dinner = spend(db, ctx, 'food', 80000, '2026-08-02', 'b');
    const deps = testDeps(Date.parse('2026-08-14T12:00:00Z'), '2026-08-14', 'up');
    updateStop(db, deps, cafe.stopId, { subkind: 'cafe' });
    updateStop(db, deps, dinner.stopId, { subkind: 'restaurant' });

    const slices = spendBySubkind(db, scope, AUG, 'food');

    expect(slices.map((s) => s.key)).toEqual(['restaurant', 'cafe']);
    expect(slices.map((s) => s.totalMinor)).toEqual([80000, 20000]);
  });

  it('groups stops with no subkind under "unsorted"', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 20000, '2026-08-01', 'a');

    const slices = spendBySubkind(db, scope, AUG, 'food');

    // Subkind is optional by design (spec §5). Dropping unlabelled stops would
    // make the drill-down disagree with the bar the user tapped.
    expect(slices).toEqual([{ key: 'unsorted', totalMinor: 20000, stopCount: 1 }]);
  });

  it('sums to the same total as its parent bar', () => {
    const { db, ctx, scope } = setup();
    const a = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 80000, '2026-08-02', 'b');
    updateStop(db, testDeps(1, '2026-08-14', 'up'), a.stopId, { subkind: 'cafe' });

    const parent = spendByKind(db, scope, AUG).find((s) => s.key === 'food');
    const drilled = spendBySubkind(db, scope, AUG, 'food');
    const drilledTotal = drilled.reduce((sum, s) => sum + s.totalMinor, 0);

    expect(drilledTotal).toBe(parent?.totalMinor);
  });
});
```

Note the `.reduce()` in the last test sums an already-fetched array to compare two aggregations. That is an assertion, not an analytics query; the SQL-not-JS rule targets the queries themselves.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/analytics/spend.test.ts`
Expected: FAIL — `./spend` does not exist.

- [ ] **Step 3: Write `src/domain/analytics/spend.ts`**

```ts
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dates, stops } from '@/db/schema';
import type { AppDatabase } from '@/db/types';
import type { CoupleScope } from '@/domain/scope';

export interface SpendSlice {
  readonly key: string;
  readonly totalMinor: number;
  readonly stopCount: number;
}

/** Stops with no subkind still belong to the total, so they get their own bucket. */
export const UNSORTED_SUBKIND = 'unsorted';

const totalExpr = sql<number>`sum(${stops.amountMinor})`;
const countExpr = sql<number>`count(${stops.id})`;

function monthScoped(db: AppDatabase, scope: CoupleScope, periodMonth: string) {
  return db
    .select({ kind: stops.kind, subkind: stops.subkind, total: totalExpr, stops: countExpr })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(stops.deletedAt),
        // Attribution follows the parent date's local day, never the stop's own
        // timestamp — a date past midnight counts entirely in one month.
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    );
}

export function spendByKind(db: AppDatabase, scope: CoupleScope, periodMonth: string): SpendSlice[] {
  return monthScoped(db, scope, periodMonth)
    .groupBy(stops.kind)
    .orderBy(desc(totalExpr))
    .all()
    .map((row) => ({
      key: row.kind,
      totalMinor: Number(row.total ?? 0),
      stopCount: Number(row.stops ?? 0),
    }));
}

export function spendBySubkind(
  db: AppDatabase,
  scope: CoupleScope,
  periodMonth: string,
  kind: string,
): SpendSlice[] {
  return db
    .select({
      subkind: sql<string>`coalesce(${stops.subkind}, ${UNSORTED_SUBKIND})`,
      total: totalExpr,
      stops: countExpr,
    })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        eq(stops.kind, kind),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) = ${periodMonth}`,
      ),
    )
    .groupBy(sql`coalesce(${stops.subkind}, ${UNSORTED_SUBKIND})`)
    .orderBy(desc(totalExpr))
    .all()
    .map((row) => ({
      key: row.subkind,
      totalMinor: Number(row.total ?? 0),
      stopCount: Number(row.stops ?? 0),
    }));
}
```

If `monthScoped`'s shared select shape makes `spendByKind`'s `groupBy` awkward to type, inline the query in both functions rather than fighting the types — two explicit queries are better than one clever one.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, **161** tests. Then `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Mutation-check**

1. Drop `isNull(stops.deletedAt)` → `excludes tombstoned stops and tombstoned dates` fails.
2. Drop `isNull(dates.deletedAt)` from the join → the same test fails on the other half.
3. Drop `eq(dates.coupleId, scope.coupleId)` → `ignores another couple's spending` fails.
4. Drop `eq(stops.currencyCode, ...)` → `excludes another currency` fails.
5. Change `desc(totalExpr)` to ascending → `ranks kinds by total spend, descending` fails.
6. Replace the `coalesce` with a bare `stops.subkind` → `groups stops with no subkind under "unsorted"` fails.

Run all six, restore each, paste the failures.

- [ ] **Step 6: Commit**

```bash
git add src/domain/analytics/spend.ts src/domain/analytics/spend.test.ts
git commit -m "feat: add spend by kind with a subkind drill-down"
```

---

## Task 3: The trailing 12-month trend

**Files:**
- Create: `src/domain/analytics/trend.ts`, `src/domain/analytics/trend.test.ts`

**Interfaces:**
- Consumes: `trailingMonths` from `./period`.
- Produces:
  ```ts
  export interface MonthTotal { readonly periodMonth: string; readonly totalMinor: number }
  export function monthlyTrend(db, scope, endMonth: string, months = 12): MonthTotal[];
  ```
  Consumed by Tasks 4 and 7.

**The series must be dense.** SQL returns only months that have rows, but a month with no dates is meaningful information — it is a gap in the couple's history, and a chart that silently closes the gap misrepresents the trend. `trailingMonths` supplies the full window and months with no spend get `0`. Assembling that is not an aggregation, so it does not breach the SQL-not-JS rule.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/analytics/trend.test.ts` with the same `setup()`/`spend()` helpers as Task 2 (copy them; a shared test helper module is more coupling than two ten-line functions are worth):

```ts
describe('monthlyTrend', () => {
  it('returns one entry per month in the window, oldest first', () => {
    const { db, scope } = setup();

    const trend = monthlyTrend(db, scope, '2026-08', 12);

    expect(trend).toHaveLength(12);
    expect(trend[0]?.periodMonth).toBe('2025-09');
    expect(trend[11]?.periodMonth).toBe('2026-08');
  });

  it('reports zero for a month with no spend rather than omitting it', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 50000, '2026-08-01', 'a');

    const trend = monthlyTrend(db, scope, '2026-08', 3);

    // A month with no dates is information. A chart that closes the gap
    // silently redraws the couple's history.
    expect(trend).toEqual([
      { periodMonth: '2026-06', totalMinor: 0 },
      { periodMonth: '2026-07', totalMinor: 0 },
      { periodMonth: '2026-08', totalMinor: 50000 },
    ]);
  });

  it('sums every stop in a month across dates', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'transport', 20000, '2026-08-09', 'b');

    expect(monthlyTrend(db, scope, '2026-08', 1)).toEqual([
      { periodMonth: '2026-08', totalMinor: 50000 },
    ]);
  });

  it('excludes spend older than the window', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 99000, '2025-01-05', 'old');

    const trend = monthlyTrend(db, scope, '2026-08', 12);

    expect(trend.every((m) => m.totalMinor === 0)).toBe(true);
  });

  it('excludes tombstones, other couples and other currencies', () => {
    const { db, ctx, scope } = setup();
    const dead = spend(db, ctx, 'food', 70000, '2026-08-02', 'x');
    db.update(stops).set({ deletedAt: 1 }).where(eq(stops.id, dead.stopId)).run();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');

    expect(monthlyTrend(db, scope, '2026-08', 1)[0]?.totalMinor).toBe(30000);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/analytics/trend.test.ts`
Expected: FAIL — `./trend` does not exist.

- [ ] **Step 3: Write the trend query**

One `GROUP BY` over the whole window, then densify:

```ts
export function monthlyTrend(
  db: AppDatabase,
  scope: CoupleScope,
  endMonth: string,
  months = 12,
): MonthTotal[] {
  const window = trailingMonths(endMonth, months);
  const first = window[0];
  const last = window[window.length - 1];
  if (first === undefined || last === undefined) return [];

  const rows = db
    .select({
      periodMonth: sql<string>`substr(${dates.occurredOn}, 1, 7)`,
      total: sql<number>`sum(${stops.amountMinor})`,
    })
    .from(stops)
    .innerJoin(dates, and(eq(dates.id, stops.dateId), isNull(dates.deletedAt)))
    .where(
      and(
        eq(dates.coupleId, scope.coupleId),
        eq(stops.currencyCode, scope.currencyCode),
        isNull(stops.deletedAt),
        sql`substr(${dates.occurredOn}, 1, 7) >= ${first}`,
        sql`substr(${dates.occurredOn}, 1, 7) <= ${last}`,
      ),
    )
    .groupBy(sql`substr(${dates.occurredOn}, 1, 7)`)
    .all();

  const byMonth = new Map(rows.map((row) => [row.periodMonth, Number(row.total ?? 0)]));
  // Densify: the query returns only months that have rows.
  return window.map((periodMonth) => ({
    periodMonth,
    totalMinor: byMonth.get(periodMonth) ?? 0,
  }));
}
```

Month keys are fixed-width `YYYY-MM`, so the `>=` / `<=` string comparison orders correctly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run` → **166** tests. `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Mutation-check**

1. Return only the SQL rows instead of densifying (`return rows.map(...)`).
   Expected: `reports zero for a month with no spend rather than omitting it` fails — the array has 1 entry, not 3.
2. Drop the `>= first` bound.
   Expected: `excludes spend older than the window` fails.
3. Reverse `window` before mapping.
   Expected: `returns one entry per month in the window, oldest first` fails.

- [ ] **Step 6: Commit**

```bash
git add src/domain/analytics/trend.ts src/domain/analytics/trend.test.ts
git commit -m "feat: add the trailing twelve-month spend trend"
```

---

## Task 4: Per-date average and top places

**Files:**
- Modify: `src/domain/analytics/trend.ts` (per-date averages belong with the trend they are compared against)
- Create: `src/domain/analytics/places.ts`, `src/domain/analytics/places.test.ts`
- Test: `src/domain/analytics/trend.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DateAverage {
    readonly monthMinor: number | null;     // null when the month has no dates
    readonly trailingMinor: number | null;  // mean across the trailing window
    readonly monthDateCount: number;
  }
  export function perDateAverage(db, scope, periodMonth: string, months = 12): DateAverage;

  export interface PlaceTotal { readonly placeName: string; readonly totalMinor: number; readonly visits: number }
  export function topPlaces(db, scope, endMonth: string, limit = 5, months = 12): PlaceTotal[];
  ```
  Consumed by Task 7.

**Why this is the number that matters** (spec §8): "mean cost per date this month vs. the trailing 12-month mean" is the single most actionable *are we creeping up* signal. A rising total might just mean more dates; a rising mean means each date costs more.

**Two decisions to get right:**
- A date counts only if it has at least one live stop **in the scope currency**. A date with no stops has no cost and would drag the mean toward zero.
- The average rounds to whole minor units with `Math.round`. Money stays integer; never return a float.
- `topPlaces` is scoped to the **same trailing window as the trend**, not the selected month — five places from a single month is mostly noise, and §8 lists it alongside the trailing-window items. Say so in a comment.

- [ ] **Step 1: Write the failing tests**

Add to `trend.test.ts`:

```ts
describe('perDateAverage', () => {
  it('divides a month\'s spend by its number of dates', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 30000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 50000, '2026-08-02', 'b');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthDateCount).toBe(2);
    expect(avg.monthMinor).toBe(40000);
  });

  it('counts one date once however many stops it has', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(Date.parse('2026-08-01T12:00:00Z'), '2026-08-01', 'one');
    captureStop(db, deps, { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'food', amountMinor: 30000, currencyCode: 'PHP' });
    captureStop(db, deps, { coupleId: ctx.coupleId, userId: ctx.userId, kind: 'transport', amountMinor: 10000, currencyCode: 'PHP' });

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthDateCount).toBe(1);
    expect(avg.monthMinor).toBe(40000);
  });

  it('reports null rather than zero when the month has no dates', () => {
    const { db, scope } = setup();

    const avg = perDateAverage(db, scope, '2026-08', 12);

    // Zero would read as "our dates were free this month".
    expect(avg.monthMinor).toBeNull();
    expect(avg.monthDateCount).toBe(0);
  });

  it('compares against the trailing window mean', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 10000, '2026-06-01', 'j');
    spend(db, ctx, 'food', 10000, '2026-07-01', 'k');
    spend(db, ctx, 'food', 70000, '2026-08-01', 'l');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(avg.monthMinor).toBe(70000);
    // Three dates, ₱900 total.
    expect(avg.trailingMinor).toBe(30000);
  });

  it('rounds to whole minor units', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 10000, '2026-08-01', 'a');
    spend(db, ctx, 'food', 10001, '2026-08-02', 'b');
    spend(db, ctx, 'food', 10001, '2026-08-03', 'c');

    const avg = perDateAverage(db, scope, '2026-08', 12);

    expect(Number.isInteger(avg.monthMinor)).toBe(true);
    expect(avg.monthMinor).toBe(10001);
  });
});
```

Create `places.test.ts` with the same helpers:

```ts
describe('topPlaces', () => {
  it('ranks places by total spend and counts visits', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(1, '2026-08-14', 'up');
    const a = spend(db, ctx, 'food', 20000, '2026-08-01', 'a');
    const b = spend(db, ctx, 'food', 30000, '2026-08-02', 'b');
    const c = spend(db, ctx, 'food', 90000, '2026-08-03', 'c');
    updateStop(db, deps, a.stopId, { placeName: 'Bag of Beans' });
    updateStop(db, deps, b.stopId, { placeName: 'Bag of Beans' });
    updateStop(db, deps, c.stopId, { placeName: 'Antonio\'s' });

    const places = topPlaces(db, scope, '2026-08', 5, 12);

    expect(places[0]).toEqual({ placeName: 'Antonio\'s', totalMinor: 90000, visits: 1 });
    expect(places[1]).toEqual({ placeName: 'Bag of Beans', totalMinor: 50000, visits: 2 });
  });

  it('skips stops with no place name', () => {
    const { db, ctx, scope } = setup();
    spend(db, ctx, 'food', 20000, '2026-08-01', 'a');

    // place_name is free text and usually blank; a "(none)" row would top the
    // chart on most couples' data and tell them nothing.
    expect(topPlaces(db, scope, '2026-08', 5, 12)).toEqual([]);
  });

  it('returns at most the requested limit', () => {
    const { db, ctx, scope } = setup();
    const deps = testDeps(1, '2026-08-14', 'up');
    for (let i = 0; i < 7; i += 1) {
      const s = spend(db, ctx, 'food', (i + 1) * 1000, `2026-08-0${i + 1}`, `p${i}`);
      updateStop(db, deps, s.stopId, { placeName: `Place ${i}` });
    }

    expect(topPlaces(db, scope, '2026-08', 5, 12)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/domain/analytics`
Expected: FAIL — `perDateAverage` and `./places` do not exist.

- [ ] **Step 3: Implement both**

`perDateAverage` needs two aggregations — a month one and a window one — each summing spend and counting **distinct dates that have at least one live in-currency stop**. `count(distinct dates.id)` over the joined rows gives exactly that, because the join already excludes stopless dates. Divide with `Math.round`, and return `null` when the count is 0.

`topPlaces` groups by `stops.place_name` with `place_name IS NOT NULL AND place_name <> ''`, ordered by total descending, limited. Scope it to the trailing window via the same `>= first` / `<= last` month bounds as the trend.

Both follow every constraint in the Global Constraints block: couple scope, currency filter, both tombstone checks, and month attribution via `substr(dates.occurred_on, 1, 7)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run` → **174** tests. `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Mutation-check**

1. Return `0` instead of `null` when the date count is 0 → `reports null rather than zero` fails.
2. Use `count(dates.id)` instead of `count(distinct dates.id)` → `counts one date once however many stops it has` fails (the count becomes 2).
3. Use `Math.floor` instead of `Math.round` → `rounds to whole minor units` fails.
4. Drop the `place_name IS NOT NULL` guard → `skips stops with no place name` fails.
5. Drop the `LIMIT` → `returns at most the requested limit` fails.

- [ ] **Step 6: Commit**

```bash
git add src/domain/analytics/trend.ts src/domain/analytics/trend.test.ts src/domain/analytics/places.ts src/domain/analytics/places.test.ts
git commit -m "feat: add per-date averages and top places"
```

---

## Task 5: The tab shell

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Move: `app/index.tsx` → `app/(tabs)/index.tsx`
- Modify: `app/_layout.tsx`

The dashboard needs to be a destination, not a screen buried behind the feed. Spec §6's module layout puts both under a `(tabs)` group.

**Move the file with `git mv`** so history follows it, and change **nothing inside it** in this task. A move and an edit in one commit is a diff nobody can review.

- [ ] **Step 1: Move the feed**

```bash
mkdir -p "app/(tabs)"
git mv app/index.tsx "app/(tabs)/index.tsx"
```

- [ ] **Step 2: Create the tab layout**

`app/(tabs)/_layout.tsx` renders a `Tabs` navigator with two screens: `index` titled "Dates" and `dashboard` titled "Spending". Style it from `theme` — `tabBarActiveTintColor: theme.color.rose`, inactive `theme.color.muted`, background `theme.color.cream`, and `headerShown: false` **for the tab screens only**, because the feed draws its own "Our dates" title and the dashboard draws its own month stepper.

`headerShown: false` here is safe in a way it was not at the root: a tab screen is always reachable from the tab bar, so it can never become a screen with no way out.

Use a text/emoji `tabBarIcon` rather than adding an icon dependency.

- [ ] **Step 3: Point the root Stack at the group**

In `app/_layout.tsx`, replace the `<Stack.Screen name="index" .../>` entry with `<Stack.Screen name="(tabs)" options={{ headerShown: false }} />`. Leave every other entry exactly as it is — the detail, composer, stop editor and share screens must keep their headers and back buttons.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → exit 0. `npx vitest run` → **174**, unchanged.

Then check every route still resolves. If a stale generated `.expo/types/router.d.ts` rejects a valid path, delete that gitignored file rather than casting.

**Verify on the simulator** — this task changes navigation, and navigation defects do not appear in diffs. Metro must be running (`npx expo start --dev-client`). Confirm: the tab bar shows two tabs; the feed still opens a date; the date detail still has a back button; capture still opens as a modal from the FAB.

- [ ] **Step 5: Commit**

```bash
git add -A app
git commit -m "feat: put the feed and dashboard in a tab group"
```

---

## Task 6: The dashboard — month stepper, budget bar, spend by kind

**Files:**
- Create: `src/ui/Bar.tsx`
- Create: `app/(tabs)/dashboard.tsx`

**Interfaces:**
- Consumes: `budgetStatusFor`, `shiftMonth`, `spendByKind`, `spendBySubkind`; `getLocalContext`, `getAppDeps` from `@/session`; `formatMoney`, `money` from `@/domain/money/money`.

These are sections 1 and 2 — the two that must fit above the fold.

- [ ] **Step 1: Build `src/ui/Bar.tsx`**

One horizontal bar: a label, a right-aligned value string, and a fill whose width is `fraction * 100%`. Props: `label: string`, `value: string`, `fraction: number`, `tint?: string`, `onPress?: () => void`.

Clamp `fraction` into `[0, 1]` — spend over budget yields a fraction above 1, and a bar wider than its track renders as an overflowing block.

The bar renders **only strings it is given**; formatting money is the screen's job.

- [ ] **Step 2: Build the screen**

State: `periodMonth`, initialised to the current month from `getAppDeps().clock.todayLocal()`; and `drilledKind: string | null`.

The month stepper: `‹` and `›` around the month label. Disable `›` when `periodMonth` is already the current month — stepping into the future shows guaranteed-empty screens and there is nothing there to find.

**Section 1 — This month.** `budgetStatusFor(db, ctx, periodMonth, todayLocal)`. Render one bar of `spentMinor / budgetMinor`, tinted `theme.color.rose` when `isOverBudget`. When `budgetMinor` is null, show the spend total and "No budget set" rather than a bar with no denominator. Show remaining and `daysLeft` when both are meaningful.

**Section 2 — Where it went.** `spendByKind(db, ctx, periodMonth)`, one `Bar` per slice with `fraction = slice.totalMinor / topSliceTotal` so the largest bar is full width. Tapping a bar sets `drilledKind`; when set, render `spendBySubkind(db, ctx, periodMonth, drilledKind)` in place of the kind list with a header showing the kind and a way back to all kinds. Empty month renders a plain "Nothing logged this month" line, not an empty chart.

Wrap the reads in a `useMemo` keyed on `[periodMonth, drilledKind, ctx]`. These are plain reads, so to pick up a capture made while the dashboard is mounted, also subscribe with `useLiveQuery(publishedDatesQuery(db, ctx), [ctx])` and include its data in the dependency list — the same pattern the share screen uses.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run` → **174**, unchanged.

**On the simulator, with the demo data seeded:** step back a month and confirm the numbers change; tap a kind bar and confirm the drill-down sums to the bar you tapped; confirm sections 1 and 2 are both visible without scrolling on an iPhone 16 (390×844pt).

- [ ] **Step 4: Commit**

```bash
git add src/ui/Bar.tsx "app/(tabs)/dashboard.tsx"
git commit -m "feat: add the dashboard's budget bar and spend breakdown"
```

---

## Task 7: Trend, per-date average, top places

**Files:**
- Modify: `app/(tabs)/dashboard.tsx`

- [ ] **Step 1: Add the three remaining sections**

**Section 3 — Trend.** `monthlyTrend(db, ctx, periodMonth, 12)` as twelve vertical bars, each `height = total / max`, with the selected month highlighted in `theme.color.rose`. Label only the first and last month; twelve rotated labels on a phone are unreadable. A month with zero spend renders as a visible baseline sliver, not nothing — the gap is the point.

**Section 4 — Per-date average.** `perDateAverage(db, ctx, periodMonth, 12)`. Show this month's mean next to the trailing mean, with the direction of change. When `monthMinor` is null, say "No dates this month" — not "₱0".

**Section 5 — Most expensive places.** `topPlaces(db, ctx, periodMonth, 5, 12)` as five rows of place and total. When empty, say that place names are optional and set in the composer, so the section explains itself rather than looking broken.

Add all three to the same `useMemo` dependency list as Task 6.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run` → **174**, unchanged.

**On the simulator:** with 12 months of demo data, confirm the trend shows twelve bars including empty months; confirm the per-date average changes when you step months; confirm top places lists real place names from the seed.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/dashboard.tsx"
git commit -m "feat: add trend, per-date average and top places"
```

---

## Manual verification (run once, after Task 7)

The five aggregations are unit-tested; these are the things no test on this project can reach. **Record the results in the report** — three plans have now shipped without their manual checks being run.

1. Seed the demo data, then step from this month back through all twelve. No crash, no blank screen, and the numbers change.
2. Step forward to the current month and confirm `›` is disabled there.
3. Tap the largest kind bar. Confirm the subkind totals sum to the bar you tapped, and that you can get back to all kinds.
4. Confirm sections 1 and 2 fit without scrolling on an iPhone 16 (spec §13 criterion 3).
5. Log a new stop from the capture sheet, return to the dashboard, and confirm this month's numbers include it.
6. Delete every stop from a date and confirm the dashboard drops it rather than showing a ₱0 date.

Then run the outstanding manual checks from **Plan 3** (`2026-08-05-v1-the-wall.md`) and **Plan 4** (`2026-08-14-v1-export.md`), which have never been executed. Plan 3's check 3 — edit a stop's amount and watch the feed total update — is still the only end-to-end verification that its `touchOwningDate` fix works.
