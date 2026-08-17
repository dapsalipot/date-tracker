# Editorial UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's generic card-and-pill look with a printed-keepsake editorial direction — a real type scale, colour roles, hairline rules instead of boxes, and restrained motion with haptics on commit.

**Architecture:** A new token layer lands first and is additive, so the app keeps compiling. Four primitives absorb the styling every screen currently hand-rolls. Screens then convert one per commit, feed first so the direction can be judged on one screen. The final task deletes the legacy colour names, which is the forcing function that proves every screen was actually revisited.

**Tech Stack:** React Native / Expo SDK 57, expo-router, `react-native-reanimated` (installed, currently unused), `expo-haptics` (new), vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-editorial-ui-design.md`

## Global Constraints

- **Zero domain changes. All 181 existing tests must stay green, untouched.** A moved or edited domain test means something crossed a boundary it should not have. Task 1 adds 3 new tests; the total is 184 from Task 1 onward.
- `src/domain/**` imports nothing from `react`, `react-native`, or `expo-*`. No task here touches `src/domain/**` except reading exported types.
- **Hierarchy comes from ratio, not ornament.** Any change that adds a border, a fill, or a radius to solve a hierarchy problem is the wrong change.
- Colours come from `theme.role.*`. No hardcoded hex anywhere, including `'#FFFFFF'` — the direction has no white surfaces.
- Type sizes come from `theme.type.*`. **No inline `fontSize` anywhere** — that is the specific defect this plan exists to remove.
- No screen imports `expo-haptics` directly; they call `tap()` / `commit()` from `src/ui/feedback.ts`.
- Every screen must stay escapable: pushed screens keep their headers and back buttons; tab screens stay reachable from the tab bar.
- The receipt template (`src/render/receipt/**`) adopts the new **colour roles only** and keeps its own 1080px type sizes. `layout.test.ts` guards its arithmetic.
- Test runner: `npx vitest run --testTimeout=30000` (the default 5s timeout is flaky on `seed.test.ts`). Type check: `npx tsc --noEmit`.
- **Never run `npm run lint`** — no ESLint config is committed and the command scaffolds one and rewrites `package.json`.
- Metro must be running for the dev build: `npx expo start --dev-client`. "No script URL provided" means Metro is down, not a code bug.
- If vitest fails with `NODE_MODULE_VERSION`, run `npm rebuild better-sqlite3`.

## Why the token rename is additive until the last task

The spec calls the colour rename "deliberately breaking" so every call site must be revisited. Taken literally that breaks all eight screens at once, which is exactly the half-finished state the spec's own risk section warns about.

Both are satisfied by ordering: **Task 1 adds `theme.role.*`, `theme.type.*` and `theme.motion.*` alongside the existing `theme.color.*` names.** The app compiles throughout. **Task 8 deletes `theme.color`,** and `tsc` then fails for any screen that was not converted. The deletion is the forcing function; the additive phase is what keeps every intermediate commit runnable.

## Verification is per screen, not at the end

There is no React test harness — `vitest` collects only `src/**/*.test.ts`, so no screen in this plan is reachable by any test. Manual verification has been skipped on four consecutive plans.

**Every screen task ends with a simulator check, and the task is not done until its result is recorded in the report.** Take a screenshot with:

```bash
xcrun simctl io booted screenshot /tmp/<screen>.png
```

## Why the screen tasks specify tokens rather than whole files

Tasks 1 and 2 give complete code, because they define contracts every later
task reads. Tasks 3–8 instead name the exact token, prop and structural change
per element, and leave the JSX assembly to the implementer.

That is deliberate. These eight screens already exist and already work — their
data wiring, live queries, in-flight guards and error paths were each fixed
across four prior plans, and reprinting them here invites an implementer to
retype working logic and drop a guard in the process. The changes that matter
are *which token, which structure, what disappears*, and those are stated
exactly. The rule is simple: **change styling and structure, touch no data
flow.** If a task seems to require changing a query, a `useMemo` dependency
list, or a guard, that is a signal to stop and report rather than proceed.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/theme.ts` *(rewrite)* | Type scale, colour roles, spacing, radii, motion tokens |
| `src/ui/theme.test.ts` *(create)* | Guards the scale against being flattened back |
| `src/ui/feedback.ts` *(create)* | `tap()` / `commit()` — the only importer of `expo-haptics` |
| `src/ui/Screen.tsx` *(create)* | Ground, safe area, standard margin |
| `src/ui/Rule.tsx` *(create)* | The hairline |
| `src/ui/MicroLabel.tsx` *(create)* | Uppercase letterspaced label |
| `src/ui/Button.tsx` *(create)* | Press animation + haptic + three variants |
| `src/render/FeedCard.tsx` *(rewrite)* | The editorial feed entry |
| `src/ui/{KindChips,SubkindChips,AmountKeypad,Bar}.tsx` *(modify)* | Same APIs, new tokens, no pills |
| `app/(tabs)/index.tsx` · `app/(tabs)/dashboard.tsx` · `app/(tabs)/_layout.tsx` *(modify)* | Feed, dashboard, tab bar |
| `app/capture.tsx` · `app/date/[id]/{index,compose,share}.tsx` · `app/date/[id]/stop/[stopId].tsx` *(modify)* | Remaining screens |

---

## Task 1: Tokens, haptics, and a guard against flattening

**Files:**
- Rewrite: `src/ui/theme.ts`
- Create: `src/ui/theme.test.ts`
- Create: `src/ui/feedback.ts`
- Modify: `package.json` (via `npx expo install expo-haptics`)

**Interfaces:**
- Produces: `theme.type.{display,title,body,meta,micro}`, `theme.role.{ground,ink,inkMuted,rule,accent,accentQuiet,gold}`, `theme.space.{xs,sm,md,lg,xl,xxl}`, `theme.radius.{sm,md,lg}`, `theme.motion.{fast,base}`, and `tap()` / `commit()` from `@/ui/feedback`. Consumed by every later task.
- `theme.color.*` stays exactly as it is until Task 8.

- [ ] **Step 1: Install haptics**

```bash
npx expo install expo-haptics
```

Use `npx expo install`, never bare `npm install` — it picks the version matching this Expo SDK. `expo-haptics` needs no config plugin and no native rebuild; confirm with `npx expo config --type introspect` that no new plugin was added, and report the version chosen.

- [ ] **Step 2: Write the failing test**

Create `src/ui/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { theme } from './theme';

describe('type scale', () => {
  it('descends at every step', () => {
    const sizes = [
      theme.type.display.fontSize,
      theme.type.title.fontSize,
      theme.type.body.fontSize,
      theme.type.meta.fontSize,
      theme.type.micro.fontSize,
    ];

    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]!).toBeLessThan(sizes[i - 1]!);
    }
  });

  it('keeps body under half of display', () => {
    // The span between the headline and the body IS the design. The look this
    // plan replaces was 28/20/16 — descending, but body sat at 0.57 of display
    // and nothing read as dominant. This scale puts it at 0.47.
    //
    // Deliberately NOT a per-step ratio: meta and micro are both small text and
    // their ratio to each other carries no hierarchy, so a uniform gap rule
    // would either reject this scale or be loose enough to accept the old one.
    const ratio = theme.type.body.fontSize / theme.type.display.fontSize;
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('gives every step a line height taller than its size', () => {
    for (const step of Object.values(theme.type)) {
      expect(step.lineHeight).toBeGreaterThan(step.fontSize);
    }
  });

  it('letterspaces micro, and only micro', () => {
    expect(theme.type.micro.letterSpacing).toBeGreaterThan(0);
    expect(theme.type.display.letterSpacing ?? 0).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL — `theme.type` is undefined.

- [ ] **Step 4: Write the tokens**

Rewrite `src/ui/theme.ts`. Keep `color` untouched; add the four new groups:

```ts
/**
 * Hierarchy comes from ratio, not ornament. Five steps with deliberate gaps —
 * the previous 28/20/16 was descending but so tightly spaced that nothing read
 * as dominant, which is most of why the app looked unstyled.
 */
const type = {
  display: { fontSize: 34, lineHeight: 36, letterSpacing: 0 },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5 },
} as const;

/**
 * The same palette addressed by meaning. Screens ask for a role, so a colour
 * decision changes in one place. `gold` has exactly one job — marking a date as
 * published — which is what keeps it meaningful.
 */
const role = {
  ground: '#FFFBF7',
  ink: '#1F1A24',
  inkMuted: '#A08E86',
  rule: '#EADFD8',
  accent: '#E8927C',
  accentQuiet: '#F7E6E1',
  gold: '#C9A227',
} as const;

const motion = {
  fast: 120,
  base: 220,
} as const;

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
  type,
  role,
  motion,
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 },
  radius: { sm: 6, md: 10, lg: 14 },
  screenMargin: 20,
} as const;
```

- [ ] **Step 5: Write the haptics wrapper**

Create `src/ui/feedback.ts`:

```ts
import * as Haptics from 'expo-haptics';

/**
 * The only module that imports expo-haptics, so there is one place to disable
 * it. Both calls are fire-and-forget: a failed haptic must never interrupt the
 * write it accompanies, and on a device with no taptic engine these reject.
 */

/** A press landed. */
export function tap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Something was committed — a stop saved, a date published, a cover set. */
export function commit(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --testTimeout=30000`
Expected: PASS, **184** tests (181 + 3).

Run: `npx tsc --noEmit`
Expected: exit 0. Every screen still compiles — `theme.color` is untouched.

- [ ] **Step 7: Mutation-check the scale guard**

Set `theme.type.display.fontSize` to `28` — the old scale's headline size, which is exactly the flatness this plan removes.
Expected: `keeps body under half of display` fails — `expected 0.5714285714285714 to be less than or equal to 0.5`.

Restore and confirm 184 green. Paste the failure into your report.

- [ ] **Step 8: Commit**

```bash
git add src/ui/theme.ts src/ui/theme.test.ts src/ui/feedback.ts package.json package-lock.json
git commit -m "feat: add editorial type scale, colour roles and haptics"
```

---

## Task 2: The four primitives

**Files:**
- Create: `src/ui/Screen.tsx`, `src/ui/Rule.tsx`, `src/ui/MicroLabel.tsx`, `src/ui/Button.tsx`

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces:
  - `<Screen>{children}</Screen>` — also accepts `scroll?: boolean`
  - `<Rule />`
  - `<MicroLabel>DATE</MicroLabel>`
  - `<Button label onPress variant?: 'primary' | 'quiet' | 'danger' disabled? />`

  Consumed by every screen task.

No tests — there is no React harness. Verify with `npx tsc --noEmit` and by reading.

- [ ] **Step 1: Screen**

```tsx
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from './theme';

/**
 * Ground, safe area, and the one screen margin. Every screen hand-rolled this
 * with slightly different padding, which is why nothing lined up between them.
 */
export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: theme.screenMargin, paddingBottom: theme.space.xxl }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: theme.screenMargin }}>{children}</View>
  );

  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground }} edges={['top', 'left', 'right']}>{body}</SafeAreaView>;
}
```

`style={{ flex: 1 }}` on the ScrollView is load-bearing: React Native defaults `flexShrink` to 0, so without it a ScrollView is sized by its content, runs past the screen edge and has nothing left to scroll.

- [ ] **Step 2: Rule**

```tsx
import { View } from 'react-native';
import { theme } from './theme';

/** The hairline the whole direction is built on. */
export function Rule() {
  return <View style={{ height: 1, backgroundColor: theme.role.rule }} />;
}
```

- [ ] **Step 3: MicroLabel**

```tsx
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { theme } from './theme';

/** Uppercase, letterspaced, muted. Was reimplemented inline on six screens. */
export function MicroLabel({ children }: { children: ReactNode }) {
  return <Text style={{ ...theme.type.micro, color: theme.role.inkMuted }}>{children}</Text>;
}
```

Callers pass already-uppercase strings, or use `textTransform: 'uppercase'`; do not `.toUpperCase()` inside the component, because it would mangle a place name a user typed.

- [ ] **Step 4: Button**

```tsx
import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { tap } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'quiet' | 'danger';

const SURFACE: Record<Variant, { background: string; border: string; text: string }> = {
  primary: { background: theme.role.ink, border: theme.role.ink, text: theme.role.ground },
  quiet: { background: 'transparent', border: theme.role.rule, text: theme.role.ink },
  danger: { background: 'transparent', border: 'transparent', text: theme.role.accent },
};

/**
 * Press feedback lives here so motion is consistent by construction rather
 * than by discipline. A screen that hand-rolls a Pressable will visibly lack
 * it, which is the point — the gap becomes obvious instead of invisible.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}) {
  const pressed = useSharedValue(0);
  const surface = SURFACE[variant];

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.97 : 1, { duration: theme.motion.fast }) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      disabled={disabled}
      style={[
        {
          paddingVertical: theme.space.md,
          alignItems: 'center',
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: surface.border,
          backgroundColor: surface.background,
          opacity: disabled ? 0.35 : 1,
        },
        animated,
      ]}
    >
      <Text style={{ ...theme.type.body, fontWeight: '600', color: surface.text }}>{label}</Text>
    </AnimatedPressable>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run --testTimeout=30000` → **184**, unchanged.

If `react-native-reanimated`'s babel plugin is not configured, `useAnimatedStyle` throws at runtime rather than compile time. Check `babel.config.js` contains `react-native-reanimated/plugin` as the **last** entry in `plugins`; if it is missing, add it and say so in your report — this is the one thing about reanimated that fails silently.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Screen.tsx src/ui/Rule.tsx src/ui/MicroLabel.tsx src/ui/Button.tsx babel.config.js
git commit -m "feat: add the editorial UI primitives"
```

---

## Task 3: The feed — judge the direction here

**Files:**
- Rewrite: `src/render/FeedCard.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `FeedDate` from `@/domain/dates/repository` (`{ id, title, occurredOn, status, stopCount, totalMinor, currencyCode, coverUri }`); `formatMoney`, `money`; the Task 1 and 2 tokens and primitives.
- Produces: `<FeedCard date onPress />` with the same props as today.

**This is the task the whole direction is judged on.** The other five screen tasks follow whatever lands here.

- [ ] **Step 1: Rewrite FeedCard as an editorial entry**

Layout, top to bottom, with no card border and no background fill of its own:

1. `MicroLabel` with the date, formatted `29 JUL` — derive it from `occurredOn` (an ISO `YYYY-MM-DD` string) without `date-fns`; a month-name lookup array and `slice` is enough and avoids a timezone round-trip.
2. Title at `theme.type.display`, colour `theme.role.ink`, `numberOfLines={2}`. Wide type at 34pt overflows readily — the receipt already needed shrink-to-fit for exactly this reason.
3. A `meta` line: `4 stops · ₱1,952`, colour `theme.role.inkMuted`.
4. **Only when `coverUri !== null`:** a full-bleed image, `aspectRatio: 4/5`, `resizeMode="cover"`, spanning edge to edge. It must escape the `Screen` margin — give the `FlatList` no horizontal padding and let the card's text block carry `paddingHorizontal: theme.screenMargin` instead, so only the photo bleeds.
5. Vertical rhythm: `theme.space.lg` above the title block, `theme.space.xl` below the entry.

Delete `TINTS`, `tintFor`, `NO_COVER_BAND_HEIGHT` and the tinted band entirely — **no photo means no block at all.** Keep `initialOf` only if the tinted band survives; it does not, so delete it too.

Wrap the entry in the same press treatment `Button` uses (`useSharedValue` + `withTiming` scale to 0.99, and `tap()` on press) rather than importing `Button`, since this is a row, not a button.

- [ ] **Step 2: Rework the feed screen**

In `app/(tabs)/index.tsx`:

- Wrap in `Screen` (non-scrolling — the `FlatList` scrolls).
- Header: `MicroLabel` reading `OUR DATES`, then the budget line at `theme.type.meta`. The current 28pt "Our dates" heading goes away; the feed's own content is the display type now.
- Draft strip: a single row with `Rule` above and below, `MicroLabel` for `2 DATES WAITING`, and the word `Finish` at `meta` in `theme.role.accent`. No filled blush pill, no radius.
- Between feed entries: `<Rule />` as the `ItemSeparatorComponent`.
- FAB: keep it, but restyle to `theme.role.ink`, `theme.radius.lg`, and add `tap()` on press.
- Published dates carry a `gold` mark: a 2pt × 12pt `gold` bar to the left of the micro date label. This is `gold`'s only job in the app.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → exit 0. Run: `npx vitest run --testTimeout=30000` → **184**, unchanged.

**Simulator check — required.** Metro must be running. Confirm and record in your report:
1. A date with no photo shows no image block and no empty space where one would be.
2. Titles are visibly dominant over the meta line — not "a bit bigger".
3. The photo, when present, reaches both screen edges while the text does not.
4. Published dates show the gold mark; drafts do not.
5. Pressing a card animates and navigates.

```bash
xcrun simctl io booted screenshot /tmp/feed-editorial.png
```

- [ ] **Step 4: Commit**

```bash
git add src/render/FeedCard.tsx "app/(tabs)/index.tsx"
git commit -m "feat: rebuild the feed as an editorial wall"
```

---

## Task 4: Capture sheet

**Files:**
- Modify: `app/capture.tsx`, `src/ui/AmountKeypad.tsx`, `src/ui/KindChips.tsx`

**Interfaces:**
- Consumes: the tokens, `Screen`, `Rule`, `MicroLabel`, `Button`, `commit()`.
- `AmountKeypad` and `KindChips` keep their exact current props.

- [ ] **Step 1: AmountKeypad**

The amount display moves to `theme.type.display` at a larger size — override to `fontSize: 56, lineHeight: 60` inline **in the keypad only**, since this is the one place a number is the entire screen. Keys go to `theme.type.title`, colour `theme.role.ink`, no background. The existing `placeholder` behaviour and the JPY/KRW decimal suppression stay exactly as they are.

- [ ] **Step 2: KindChips — no more pills**

Replace the filled pill with text plus an underline on the selected item:

```tsx
<Pressable key={kind} onPress={() => { tap(); onSelect(kind); }} style={{ paddingVertical: theme.space.sm }}>
  <Text
    style={{
      ...theme.type.body,
      color: kind === selected ? theme.role.ink : theme.role.inkMuted,
      borderBottomWidth: kind === selected ? 2 : 0,
      borderBottomColor: theme.role.accent,
      paddingBottom: 2,
    }}
  >
    {LABELS[kind]}
  </Text>
</Pressable>
```

Drop the emoji from `LABELS` — plain words carry the editorial direction, and the emoji are the most template-looking element on the screen.

- [ ] **Step 3: The sheet**

- `Screen`, non-scrolling.
- Top row: `Cancel` as a `Button` variant `danger`, and the budget line at `theme.type.micro` on the right.
- Keypad fills the middle.
- Chips in a single row beneath, `Rule` above them.
- Bottom: the camera control as `Button` variant `quiet`, and Save as `Button` variant `primary`.
- **`commit()` fires on a successful save**, immediately before `router.back()`, and never on the failure path.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run --testTimeout=30000` → **184**.

**Simulator check — required.** Record: the amount dominates the screen; selecting a kind moves the underline; saving fires a haptic and returns; the failure alert does not fire one.

```bash
xcrun simctl io booted screenshot /tmp/capture-editorial.png
```

- [ ] **Step 5: Commit**

```bash
git add app/capture.tsx src/ui/AmountKeypad.tsx src/ui/KindChips.tsx
git commit -m "feat: restyle the capture sheet"
```

---

## Task 5: Date detail

**Files:**
- Modify: `app/date/[id]/index.tsx`

- [ ] **Step 1: Rebuild the stop list as an editorial list**

- `Screen`, with the `FlatList` scrolling inside it.
- Header: `MicroLabel` with the date and status, title at `theme.type.display`.
- Photo strip stays, but images lose their radius and gain `theme.space.xs` gaps.
- Each stop row: label at `theme.type.title`, place/subkind beneath at `theme.type.meta` in `inkMuted`, amount right-aligned **on the title's baseline** (`alignItems: 'baseline'` on the row).
- `Rule` between rows; no `borderBottomWidth` on the rows themselves.
- **Reorder arrows move behind a long press.** Default state shows no arrows at all. `onLongPress` on a row sets a `reordering` state that reveals ↑/↓ for every row; tapping anywhere else clears it. This removes the per-row clutter while keeping reorder reachable.
- Edit and Share become `Button` variants `primary` and `quiet`.

The existing rule stands: **Share only renders when `detail.status === 'published'`.**

- [ ] **Step 2: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run --testTimeout=30000` → **184**.

**Simulator check — required.** Record: arrows are absent until a long press; reordering still works and persists after navigating away and back; amounts sit on the label baseline; a draft shows no Share button.

```bash
xcrun simctl io booted screenshot /tmp/detail-editorial.png
```

- [ ] **Step 3: Commit**

```bash
git add "app/date/[id]/index.tsx"
git commit -m "feat: restyle the date detail as an editorial list"
```

---

## Task 6: Composer and stop editor

**Files:**
- Modify: `app/date/[id]/compose.tsx`, `app/date/[id]/stop/[stopId].tsx`, `src/ui/SubkindChips.tsx`

Both screens are small now — the composer holds one field since caption and rating were removed.

- [ ] **Step 1: Composer**

- `Screen`, scrolling.
- `MicroLabel` with the date, then the title `TextInput` styled at `theme.type.display` with **no border and no background** — just text on the ground, with a `Rule` beneath it. Keep `maxLength={60}`.
- Photo strip: images lose their radius; the cover keeps a 2pt `theme.role.accent` border; the add tile becomes a `Rule`-bordered square with a `+` at `theme.type.title`.
- `commit()` fires when a cover is set and when the date is published.
- Save and Publish become `Button` variants `quiet` and `primary`.

- [ ] **Step 2: SubkindChips — match KindChips**

Same treatment as Task 4 Step 2: text with an accent underline on the selected item, no pill, no radius. Tapping the selected chip still clears it, and `other` (which has no subkinds) still renders nothing.

- [ ] **Step 3: Stop editor**

- `Screen`, scrolling.
- `MicroLabel` with the kind, keypad, then subkind chips.
- The two `TextInput`s lose their boxes: no `borderWidth`, no `backgroundColor`, no radius. Each becomes text at `theme.type.body` with a `Rule` beneath and a `MicroLabel` above it (`WHAT` and `WHERE`).
- Save is `Button` variant `primary`; Remove stop is `Button` variant `danger`.
- `commit()` on a successful save and on a confirmed delete.

- [ ] **Step 4: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run --testTimeout=30000` → **184**.

**Simulator check — required.** Record: the composer's title reads as display type, not as a form field; the stop editor's inputs have no boxes; the keypad still cannot type past the currency's decimal cap; saving fires a haptic.

```bash
xcrun simctl io booted screenshot /tmp/compose-editorial.png
xcrun simctl io booted screenshot /tmp/stop-editorial.png
```

- [ ] **Step 5: Commit**

```bash
git add "app/date/[id]/compose.tsx" "app/date/[id]/stop/[stopId].tsx" src/ui/SubkindChips.tsx
git commit -m "feat: restyle the composer and stop editor"
```

---

## Task 7: Share and dashboard

**Files:**
- Modify: `app/date/[id]/share.tsx`, `app/(tabs)/dashboard.tsx`, `src/ui/Bar.tsx`, `src/render/receipt/ReceiptTemplate.tsx`

- [ ] **Step 1: Bar — flat, no radius**

Remove both `borderRadius` values and the default `tint`. Track becomes `theme.role.rule`, fill defaults to `theme.role.ink`, `TRACK_HEIGHT` drops to 6. Label goes to `theme.type.meta` in `ink`, value to `theme.type.meta` in `inkMuted`. **Keep the `Math.max(0, Math.min(1, fraction))` clamp exactly as it is** — over-budget spend yields a fraction above 1 and an unclamped fill outgrows its track.

- [ ] **Step 2: Share screen**

Preview keeps the full width. Money-mode and size selectors get the KindChips treatment — text with an accent underline, no pills. Share becomes `Button` variant `primary`. The existing retry alert, the in-flight guard, and the `useWindowDimensions` scaling all stay exactly as they are.

- [ ] **Step 3: Dashboard**

- Section heads become `MicroLabel`.
- The headline spend number goes to `theme.type.display`; supporting figures to `theme.type.meta`.
- Trend chart: bars sit flush with `Rule`-coloured 1pt separators instead of gaps, and the selected month's bar is `theme.role.accent` while the rest are `theme.role.ink`.
- Month stepper arrows become `Button` variant `quiet`.
- **Keep `style={{ flex: 1 }}` on the ScrollView** — without it the lower sections become unreachable.

- [ ] **Step 4: Receipt — colour roles only**

In `ReceiptTemplate.tsx`, swap `theme.color.*` for `theme.role.*` (`cream`→`ground`, `ink`→`ink`, `muted`→`inkMuted`, `line`→`rule`, `rose`→`accent`). **Change no sizes** — the receipt is a 1080px render target with its own scale, and `layout.test.ts` asserts its arithmetic.

- [ ] **Step 5: Verify**

`npx tsc --noEmit` → exit 0. `npx vitest run --testTimeout=30000` → **184**, including all 8 `layout.test.ts` tests. If any of those 8 fail, a size changed and must be reverted.

**Simulator check — required.** Record: the receipt preview looks unchanged in layout; dashboard bars are flat; sections 4 and 5 are reachable by scrolling.

```bash
xcrun simctl io booted screenshot /tmp/dashboard-editorial.png
xcrun simctl io booted screenshot /tmp/share-editorial.png
```

- [ ] **Step 6: Commit**

```bash
git add "app/date/[id]/share.tsx" "app/(tabs)/dashboard.tsx" src/ui/Bar.tsx src/render/receipt/ReceiptTemplate.tsx
git commit -m "feat: restyle the share screen and dashboard"
```

---

## Task 8: Tab bar, and delete the legacy tokens

**Files:**
- Modify: `app/(tabs)/_layout.tsx`, `src/ui/theme.ts`

This task's deletion is the forcing function: `tsc` fails for any screen that was not converted.

- [ ] **Step 1: Tab bar**

Replace the two glyph `tabBarIcon`s with text-only labels. Active tab: `theme.role.ink` with a 2pt `theme.role.gold` underline via `tabBarItemStyle`. Inactive: `theme.role.inkMuted`. Bar background `theme.role.ground`, top border `theme.role.rule`. Set `tabBarLabelStyle` from `theme.type.micro` with `textTransform: 'uppercase'`.

- [ ] **Step 2: Delete `theme.color`**

Remove the entire `color` group from `src/ui/theme.ts`.

- [ ] **Step 3: Run the forcing function**

Run: `npx tsc --noEmit`

Expected: **exit 0.** Every remaining reference would be an error naming its file and line.

If errors appear, each one is a surface Tasks 3–7 missed. Fix each by reaching for the role that carries the right *meaning* — do not mechanically map `cream`→`ground` in a spot where the surface should now be a `Rule` or nothing at all. Report every file this step caught; that list is the real measure of whether the conversion was complete.

- [ ] **Step 4: Verify**

Run: `npx vitest run --testTimeout=30000` → **184**.

```bash
grep -rn "#FFFBF7\|#1F1A24\|#E8927C\|#F7E6E1\|#C9A227\|#A08E86\|#EADFD8\|#FFFFFF" src/ app/ | grep -v "src/ui/theme.ts"
```

Expected: no output. Any hit is a hardcoded hex that escaped the token layer.

```bash
grep -rn "fontSize:" src/ app/ | grep -v "src/ui/theme.ts" | grep -v "src/render/receipt/"
```

Expected: only the capture keypad's deliberate 56pt override. Every other hit is an inline magic number — the exact defect this plan set out to remove.

**Simulator check — required.** Record: both tabs switch, the active tab shows the gold underline, and every screen still renders.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/_layout.tsx" src/ui/theme.ts
git commit -m "feat: restyle the tab bar and remove the legacy colour tokens"
```

---

## Manual verification (run once, after Task 8)

Each screen was checked as it converted; this pass is for what only shows up across the whole app. Record the results.

1. Walk feed → date → stop editor → back → composer → share. Every screen has a way out, and the back button never disappears.
2. Capture a stop and confirm the haptic fires once, not twice.
3. Turn on the largest accessibility text size. Confirm no `display`-size title clips its container and no screen loses a control off the bottom.
4. Log a stop, return to the feed, and confirm the total updates — this is still the only end-to-end check of `touchOwningDate`.
5. Export a receipt and confirm its layout is unchanged from before this plan.

Then run the outstanding manual checks from **Plan 3** (`2026-08-05-v1-the-wall.md`), **Plan 4** (`2026-08-14-v1-export.md`) and **Plan 5** (`2026-08-14-v1-dashboard.md`), none of which have ever been executed.
