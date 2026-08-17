# Nocturnal UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the app to a dark, dense, unmistakably-mobile look whose richness comes from a six-colour kind system doing real work, with orange-red promoted to a second brand colour.

**Architecture:** The token layer is repalettedin place — the type scale, primitives, haptics and reanimated wiring from the previous attempt all survive; only colour values and the surface model change. A `Card` primitive is added because this direction has cards again. Screens then convert one per commit, feed first. The last task deletes the legacy names so `tsc` names anything missed.

**Tech Stack:** React Native / Expo SDK 57, expo-router, react-native-reanimated, expo-haptics, vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-nocturnal-ui-design.md`

## What already landed and stays

Three commits from the abandoned editorial attempt are **kept, not reverted**: the type scale and its guard (`src/ui/theme.test.ts`), `src/ui/feedback.ts`, `Screen` / `MicroLabel` / `Button`, `expo-haptics`, and the `react-native-reanimated/plugin` babel fix. The hierarchy was never the objection.

`src/render/FeedCard.tsx` and `app/(tabs)/index.tsx` **were** converted to the editorial direction and must be redone — they are wrong in layout, not only in colour.

## Global Constraints

- **Zero domain changes. All 186 tests must stay green, untouched.** A moved or edited domain test means something crossed a boundary it should not have.
- `src/domain/**` imports nothing from `react`, `react-native`, or `expo-*`.
- **Every colour must carry information.** A hue that only decorates is the slop this replaces.
- **`theme.role.primary` (`#FF6B4A`) is the brand's alone.** No kind may use it, and it never appears as a chip fill.
- **Kind colours outline chips; they never fill them.** They *do* fill bars and bar segments, where the fill is the data.
- Colours come from `theme.role.*` or `theme.kind.*`. **No hardcoded hex anywhere**, including `'#FFFFFF'`.
- Type sizes come from `theme.type.*`. **No inline `fontSize` anywhere.**
- No screen imports `expo-haptics` directly; they call `tap()` / `commit()` from `src/ui/feedback.ts`.
- Every screen stays escapable: pushed screens keep headers and back buttons; tab screens stay reachable from the tab bar.
- **The receipt export stays light** and adopts none of the dark roles. It keeps its own cream ground and 1080px type scale. This split is deliberate — do not "fix" it for consistency.
- Test runner: `npx vitest run --testTimeout=30000`. Type check: `npx tsc --noEmit`.
- **Never run `npm run lint`** — no ESLint config is committed and the command scaffolds one and rewrites `package.json`.
- Metro must be running: `npx expo start --dev-client`. "No script URL provided" means Metro is down, not a code bug.
- If vitest fails with `NODE_MODULE_VERSION`, run `npm rebuild better-sqlite3`.

## Verification is per screen, not at the end

No screen here is reachable by any test — `vitest` collects only `src/**/*.test.ts` and there is no React harness. **Every screen task ends with a simulator check recorded in its report.**

```bash
xcrun simctl io booted screenshot /tmp/<screen>.png
```

Read the PNG back and describe what is actually on it. A dark UI additionally needs checking at **reduced simulator brightness** — contrast that looks fine on a bright monitor can vanish at 30%.

## Why the screen tasks specify tokens rather than whole files

Tasks 1–2 give complete code, since they define contracts every later task reads. Tasks 3–8 name the exact token, structure and behaviour change per element and leave JSX assembly to the implementer.

These screens already work — their live queries, in-flight guards and error paths were fixed across five prior plans, and reprinting them invites an implementer to retype working logic and drop a guard. **Change styling and structure, touch no data flow.** If a task seems to need a query, a `useMemo` dependency list or a guard changed, stop and report.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/theme.ts` *(modify)* | Repalette: nocturnal roles + kind colours |
| `src/ui/theme.test.ts` *(modify)* | Add guards for the kind system |
| `src/ui/Card.tsx` *(create)* | The raised surface this direction is built on |
| `src/ui/Button.tsx` *(modify)* | Primary becomes orange-red on dark |
| `src/ui/KindChips.tsx` · `SubkindChips.tsx` *(modify)* | Outline in kind colour |
| `src/ui/Bar.tsx` *(modify)* | Kind-coloured fill, segmented variant |
| `src/render/FeedCard.tsx` *(rewrite)* | Thumbnails, stop chips, card |
| `app/**` *(modify)* | Eight screens |

---

## Task 1: Repalette the tokens

**Files:**
- Modify: `src/ui/theme.ts`, `src/ui/theme.test.ts`

**Interfaces:**
- Produces: `theme.role.{ground,surface,line,ink,inkMuted,primary,onPrimary}` and `theme.kind.{food,transport,activity,shopping,gift,other}`. `theme.type`, `theme.space`, `theme.radius`, `theme.motion` are unchanged. The old `theme.role.{rule,accent,accentQuiet,gold}` names are **removed** — `tsc` will name every screen still reading them, which is the point.
- `theme.color.*` still stays until Task 8.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/theme.test.ts`:

```ts
import { STOP_KINDS } from '@/domain/stops/taxonomy';

describe('colour system', () => {
  it('gives every stop kind its own colour', () => {
    for (const kind of STOP_KINDS) {
      expect(theme.kind[kind]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('never lets a kind wear the brand colour', () => {
    // primary carries actions, key numbers, the FAB and the active tab. A kind
    // wearing it collapses "what this is" into "what you can do".
    for (const kind of STOP_KINDS) {
      expect(theme.kind[kind].toUpperCase()).not.toBe(theme.role.primary.toUpperCase());
    }
  });

  it('keeps every kind colour distinct', () => {
    const used = Object.values(theme.kind).map((hex) => hex.toUpperCase());
    expect(new Set(used).size).toBe(used.length);
  });

  it('keeps the ground darker than the card surface', () => {
    // On a dark UI the floor must sit BELOW the cards. The previous attempt used
    // the brand plum as the ground, which left cards nothing to rise from.
    const luminance = (hex: string) =>
      Number.parseInt(hex.slice(1, 3), 16) +
      Number.parseInt(hex.slice(3, 5), 16) +
      Number.parseInt(hex.slice(5, 7), 16);

    expect(luminance(theme.role.ground)).toBeLessThan(luminance(theme.role.surface));
  });
});
```

`theme.ts` may now import `STOP_KINDS`'s *type* but must not import react/react-native/expo — the test runs in plain Node. `taxonomy.ts` is pure data, so importing it is safe.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL — `theme.kind` is undefined.

- [ ] **Step 3: Repalette**

Replace the `role` group and add `kind`:

```ts
import type { StopKind } from '@/domain/stops/taxonomy';

/**
 * Dates happen at night. A dark ground is honest to when the app is used,
 * flatters photographs, and lets saturated accents read without becoming candy.
 *
 * `surface` is the original brand plum, demoted from ground to card. On a dark
 * UI the floor must sit below the cards.
 */
const role = {
  ground: '#121016',
  surface: '#1E1B24',
  line: '#2C2833',
  ink: '#F5F2EE',
  inkMuted: '#8A8290',
  /** The second brand colour: actions, key numbers, FAB, active tab. */
  primary: '#FF6B4A',
  onPrimary: '#1A0A05',
} as const;

/**
 * Six kinds, six hues, cool-shifted so warm-red stays the brand's alone.
 * These OUTLINE chips and FILL bars — never the reverse. Filled cool chips
 * beside a solid orange button turn a card into competing colour masses.
 */
const kind: Record<StopKind, string> = {
  food: '#F5C242',
  transport: '#6BD97F',
  activity: '#3DD6C4',
  shopping: '#5B9DFF',
  gift: '#C77DFF',
  other: '#8A8290',
};
```

Export `kind` alongside `role` in the `theme` object. Delete `rule`, `accent`, `accentQuiet` and `gold` from `role`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --testTimeout=30000`
Expected: PASS, **190** tests (186 + 4).

Run: `npx tsc --noEmit`
Expected: **errors** — `FeedCard.tsx` and `app/(tabs)/index.tsx` read the deleted `role.rule` / `role.accent` / `role.gold`. Those two files are Task 3's job. **Leave them broken and record the exact error list in your report**; it is the migration's to-do list.

- [ ] **Step 5: Mutation-check the kind guards**

1. Set `theme.kind.food` to `'#FF6B4A'`.
   Expected: `never lets a kind wear the brand colour` fails.
2. Set `theme.kind.transport` to the same hex as `theme.kind.activity`.
   Expected: `keeps every kind colour distinct` fails.
3. Swap `role.ground` and `role.surface`.
   Expected: `keeps the ground darker than the card surface` fails.

Restore each; paste the failures.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.ts src/ui/theme.test.ts
git commit -m "feat: repalette the tokens for the nocturnal direction"
```

Committing with `tsc` failing is deliberate here and only here — Task 3 closes it. Say so in the commit body.

---

## Task 2: Card, and the primitives that change on dark

**Files:**
- Create: `src/ui/Card.tsx`
- Modify: `src/ui/Button.tsx`, `src/ui/Rule.tsx`, `src/ui/KindChips.tsx`, `src/ui/SubkindChips.tsx`, `src/ui/Bar.tsx`

**Interfaces:**
- Produces: `<Card>{children}</Card>` accepting `onPress?`, `padded?: boolean` (default true).
- `Button` keeps its props; `primary` becomes `role.primary` fill with `role.onPrimary` text, `quiet` becomes a `role.line` border with `role.ink` text, `danger` stays text-only in `role.primary`.
- `KindChips` / `SubkindChips` keep their props exactly.
- `Bar` gains `segments?: { fraction: number; color: string }[]`; when given, it renders a segmented track instead of a single fill.

- [ ] **Step 1: Card**

```tsx
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { tap } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The raised surface this direction is built on. No border: the ground is
 * darker than the card, which is what makes it read as raised. Adding a border
 * would be solving a hierarchy problem with ornament.
 */
export function Card({
  children,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
}) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.985 : 1, { duration: theme.motion.fast }) }],
  }));

  const surface = {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden' as const,
    padding: padded ? theme.space.md : 0,
  };

  if (onPress === undefined) return <View style={surface}>{children}</View>;

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      style={[surface, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
```

- [ ] **Step 2: Button on dark**

Update `SURFACE`: `primary` → background `theme.role.primary`, border same, text `theme.role.onPrimary`. `quiet` → transparent background, border `theme.role.line`, text `theme.role.ink`. `danger` → transparent, transparent border, text `theme.role.primary`. Everything else in the file is unchanged.

- [ ] **Step 3: Chips outline in kind colour**

`KindChips` renders each kind as a pill **outline** in `theme.kind[kind]` with matching text, and the unselected state at `theme.role.inkMuted` with a `theme.role.line` border. Selected state: the kind's own colour for both border and text, plus `borderWidth: 1.5`. No fill in either state. Keep the existing labels but drop the emoji.

`SubkindChips` gets the same treatment, coloured by the **parent kind** passed in its `kind` prop.

- [ ] **Step 4: Bar**

Track becomes `theme.role.line`. Default fill becomes `theme.role.primary`. Add the optional `segments` prop: when present, render a row of `View`s inside the track, each `flex`-weighted by its `fraction` and filled with its `color`, with any remainder left as track. Keep the `Math.max(0, Math.min(1, fraction))` clamp on the single-fill path exactly as it is — over-budget spend yields a fraction above 1 and an unclamped fill outgrows its track.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — still failing only on `FeedCard.tsx` and `app/(tabs)/index.tsx`. If any other file now errors, a primitive's API changed when it should not have; fix it rather than the caller.

Run: `npx vitest run --testTimeout=30000` → **190**, unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Card.tsx src/ui/Button.tsx src/ui/Rule.tsx src/ui/KindChips.tsx src/ui/SubkindChips.tsx src/ui/Bar.tsx
git commit -m "feat: add Card and adapt the primitives to the dark palette"
```

---

## Task 3: The feed, rebuilt dense — judge the direction here

**Files:**
- Rewrite: `src/render/FeedCard.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Card`, `MicroLabel`, `Screen`, `theme`, `tap`; `FeedDate` (`{ id, title, occurredOn, status, stopCount, totalMinor, currencyCode, coverUri }`).
- **Needs data the current `FeedDate` does not carry:** the kinds present on a date, for the stop chips. `listFeedDates` already joins `stops`. **Do not change the query.** Instead render chips from what is available, or report NEEDS_CONTEXT with what the view model would have to expose. Do not invent a second query in the screen.

**This is the task the direction is judged on.** The editorial version of both files is discarded, not adapted.

- [ ] **Step 1: FeedCard**

A `Card` with `padded={false}`, containing:

1. **Thumbnail strip** — only when the date has photos. A row of up to three images at a fixed height (~96), `gap: 2`, the third overlaid with `+N` in `role.ink` over a dark scrim when more exist. **When there are no photos, render no strip and no placeholder** — most dates have none, so this is the default appearance and must look finished.
2. **Body** at `padding: theme.space.md`:
   - Title at `theme.type.title` in `role.ink` and the total at `theme.type.title` in `role.ink`, on one baseline-aligned row (`alignItems: 'baseline'`, `justifyContent: 'space-between'`).
   - A `meta` line: `Sat 29 Jul · 4 stops` in `role.inkMuted`. Derive the weekday and month from the ISO `occurredOn` string with lookup arrays — **do not construct a `Date`**, which reintroduces the timezone round-trip the app avoids. Zeller's congruence or a fixed anchor is fine for the weekday; state which you used.
   - **Stop chips** — outlined in kind colour, at `theme.type.micro`, wrapping to at most two rows.

The card no longer distinguishes published from draft visually; the draft strip above the list already does that, and `gold` is gone.

- [ ] **Step 2: The feed screen**

- `Screen` (non-scrolling; the `FlatList` scrolls).
- Header: `MicroLabel` with the month, and the budget remaining at `theme.type.display` in `theme.role.primary` — this is the screen's key number and the brand colour's main job here.
- Draft strip: a `Card` with `onPress`, `MicroLabel` reading `2 DATES WAITING`, and `Finish` in `role.primary`.
- `FlatList` with `gap: theme.space.md` between cards via `ItemSeparatorComponent` or `contentContainerStyle`. No `Rule` separators — cards and space separate now.
- FAB: `role.primary` fill, `role.onPrimary` glyph, `theme.radius.lg`, `tap()` on press.
- Restore the horizontal padding the editorial version removed; nothing bleeds now.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → **exit 0.** This is the task that closes Task 1's deliberate breakage; if errors remain, they name files Task 1 predicted and this task must resolve.

Run: `npx vitest run --testTimeout=30000` → **190**, unchanged.

**Simulator check — required.** Reload, screenshot, read the PNG back, and record: (1) a date with no photos shows no strip and no gap; (2) two dates fit on screen at once; (3) stop chips are outlined, not filled, and their colours match their kinds; (4) the budget number is the only large orange element; (5) pressing a card animates and navigates. Then set simulator brightness to ~30% and confirm `inkMuted` text is still readable.

```bash
xcrun simctl io booted screenshot /tmp/feed-nocturnal.png
```

- [ ] **Step 4: Commit**

```bash
git add src/render/FeedCard.tsx "app/(tabs)/index.tsx"
git commit -m "feat: rebuild the feed dense on the nocturnal palette"
```

---

## Tasks 4–8

**Only start these once Task 3 has been judged by a human.** The remaining seven screens follow whatever the feed establishes; converting them before the direction is confirmed is what made the previous attempt expensive.

Each follows the same shape — replace `theme.color.*` with `theme.role.*`, wrap grouped content in `Card`, use `Button` for every action, chips outline in kind colour, `commit()` on writes, then a required simulator check.

- **Task 4 — Capture sheet.** Amount at `display` in `role.primary`. Kind chips outlined. `commit()` on save only, never on the failure path.
- **Task 5 — Date detail.** Stops as rows inside one `Card`, each with its kind's colour as a 3pt left edge. Reorder arrows behind a long press. Share stays published-only.
- **Task 6 — Composer and stop editor.** Title input on `surface` with no border. Photo grid with the cover marked in `role.primary`. Stop editor's inputs lose their boxes.
- **Task 7 — Share and dashboard.** Dashboard gets the segmented budget bar, kind-coloured per-kind bars, and the sparkline with the current month in `role.primary`. **The receipt template keeps its light palette entirely — it adopts nothing from this plan.**
- **Task 8 — Tab bar and cleanup.** Text labels, `role.primary` underline on the active tab. Then delete `theme.color` and run the forcing greps:

```bash
grep -rn "fontSize:" src/ app/ | grep -v "src/ui/theme.ts" | grep -v "src/render/receipt/"
grep -rnE "#[0-9A-Fa-f]{6}" src/ app/ | grep -v "src/ui/theme.ts" | grep -v "src/render/receipt/"
```

Both must return nothing but the capture keypad's deliberate size override.

---

## Manual verification (after Task 8)

1. Walk every screen; each has a way out.
2. Simulator brightness at 30% — all text readable, kind colours still distinguishable.
3. Capture a stop: one haptic, not two.
4. Largest accessibility text size: no clipped titles, no controls off the bottom.
5. Export a receipt and confirm it is still **light** and unchanged in layout.
6. Log a stop, return to the feed, confirm the total updates — still the only end-to-end check of `touchOwningDate`.

Then the outstanding manual checks from Plans 3, 4 and 5, none of which have ever been run.
