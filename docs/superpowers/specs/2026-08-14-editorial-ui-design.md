# Editorial UI — Design

## 1. Thesis

The app works and looks generic. Every surface is a white rounded box on cream with a 1px border; every screen reaches for filled pills; there is no type scale at all — each `fontSize` is an inline magic number, and the three that recur (28, 20, 16) sit close enough together that nothing reads as dominant. Plum-black and gold are in the palette and barely appear. `react-native-reanimated` is installed and entirely unused, so nothing moves.

That combination is what "AI slop" describes: uniform containers, uniform spacing, weak hierarchy, no motion, no point of view.

The fix is a **printed-keepsake direction**. Editorial layout logic — a wide type ratio, generous vertical rhythm, hairline rules instead of boxes, photos bleeding edge to edge — replaces the card grid. The product is a keepsake the couple made; it should read like a zine they printed, not a dashboard they were assigned.

**No new typeface.** The hierarchy comes from scale and spacing, which is where most of the effect lives anyway. A display face can drop in later without touching layout.

## 2. Decisions

| Area | Decision |
|---|---|
| Direction | Printed keepsake — editorial, photo-forward, rules not boxes |
| Typeface | System sans, with a real five-step scale. No bundled fonts |
| Feed layout | Rules-and-bleed: micro date, display title, meta line, optional full-width photo, hairline between entries |
| Photo absence | The default case. The photo block collapses to nothing; the layout must look deliberate with zero images |
| Motion | Restrained only — press-in, screen push, draft strip entry. No decorative motion |
| Haptics | `expo-haptics`, fired on commit actions |
| Colour | Same palette, exposed as roles rather than names. Gold becomes the single "published" mark |
| Dark mode | Out of scope |

**Guiding principle:** *hierarchy comes from ratio, not from ornament.* Any change that adds a border, a fill, or a radius to solve a hierarchy problem is the wrong change.

## 3. Token layer

Replaces `src/ui/theme.ts` wholesale.

### Type scale

Five steps, deliberately gappy. The ratio is the design.

| Token | Size / line | Extra | Use |
|---|---|---|---|
| `display` | 34 / 36 | — | Date titles, screen titles, amounts |
| `title` | 22 / 28 | — | Section heads, stop labels |
| `body` | 16 / 24 | — | Input text, prose |
| `meta` | 13 / 18 | — | Totals, counts, secondary |
| `micro` | 11 / 14 | +1.5 letterspacing, uppercase | Dates, section labels |

Today's 28 → 20 → 16 reads as unstyled defaults. 34 → 22 → 13 reads as chosen.

### Spacing

`xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64`. The two new steps carry the vertical rhythm between editorial blocks. Screen margin becomes 20.

### Radii

`sm: 6, md: 10, lg: 14` — down from 8/16/20. Editorial wants tight corners or none. Most surfaces will use no radius at all.

### Colour roles

Same hexes, addressed by role. Screens ask for meaning, not for a colour name.

| Role | Hex | Meaning |
|---|---|---|
| `ground` | `#FFFBF7` | Page |
| `ink` | `#1F1A24` | Primary text, primary fills |
| `inkMuted` | `#A08E86` | Secondary text |
| `rule` | `#EADFD8` | Hairlines |
| `accent` | `#E8927C` | The one accent per screen |
| `accentQuiet` | `#F7E6E1` | Rare tinted ground |
| `gold` | `#C9A227` | Published / finished marks only |

`gold` is currently unused anywhere in the app. Giving it exactly one job is what keeps it meaningful.

### Motion and haptics

`duration.fast: 120`, `duration.base: 220`, one spring config, and a haptics wrapper exposing `tap()` and `commit()`. No screen imports `expo-haptics` directly — one module means one place to disable it.

## 4. Primitives

Four new files. The bar for inclusion: appears on three or more screens with the same meaning.

- **`Screen`** — ground, safe area, the 20pt margin. Every screen hand-rolls this today with differing padding.
- **`Rule`** — the hairline. Currently inline `borderBottomWidth` on assorted Views in three different colours.
- **`MicroLabel`** — uppercase, letterspaced, muted. Reimplemented inline on six screens.
- **`Button`** — replaces the hand-rolled `Pressable` + six inline style properties on every screen. Variants `primary` (ink fill), `quiet` (rule border), `danger` (rose text). Press animation and `tap()` live here, so motion is consistent by construction.

**Reworked:** `FeedCard` becomes the editorial entry. `Bar`, `AmountKeypad`, `KindChips`, `SubkindChips` keep their public APIs and re-read the new tokens.

**Deliberately not built:** a `Card` wrapper (the direction has almost no boxes), a `Text` wrapper (RN `Text` plus a style token suffices), `Stack`/`Spacer` (flexbox `gap` covers it).

Centralising press feedback in `Button` means any screen not using it will visibly lack motion. That is intended — it makes the gap obvious rather than invisible.

## 5. Screens

Each entry names the change and the slop it removes.

**Feed.** Micro date label, `display` title, `meta` line, optional full-width photo bleeding edge to edge, hairline between entries. No card border, no white-on-cream surface. The draft strip becomes a rule-bounded line rather than a filled pill. *Removes: uniform bordered cards; the invisible white-on-cream surface.*

**Capture sheet.** Amount at `display` — it is the only thing that matters. Kind chips become a single row of text with the selection underlined. Budget line moves to `micro` at the top edge. `commit()` on save. *Removes: three competing pill rows.*

**Date detail.** `display` title, stops as an editorial list separated by rules, amounts right-aligned on the baseline. Reorder arrows appear on press-and-hold rather than on every row. *Removes: per-row arrow clutter.*

**Composer.** Title field and publish only: `display`-size title on the ground, photo strip, one primary action. *Removes: a form-shaped screen holding one input.*

**Stop editor.** Keypad amount at `display`, subkind as underlined text, label and place as underline-only fields. *Removes: stacked bordered inputs reading as a settings page.*

**Share.** Preview at full width, controls as a quiet strip beneath. Money modes become underlined text. *Removes: pill rows competing with the artwork.*

**Dashboard.** Section heads at `micro`, numbers at `display`. Bars are flat ink fills on a `rule` track with no radius. The trend loses per-bar gaps in favour of hairline separators. *Removes: rounded candy bars.*

**Tab bar.** Text-only labels with a gold underline on the active tab. *Removes: placeholder glyphs.*

Every screen loses its filled pills and bordered boxes. This is a whole-app swing, not a selective one.

## 6. Testing

**Zero domain changes. All 181 tests must stay green, untouched.** A moved test means something crossed a boundary it should not have.

Two genuine guards:
- `layout.test.ts` (8 tests) asserts the receipt template's layout arithmetic and therefore covers the token change where it touches the receipt.
- `tsc` catches every call site reading a renamed token. The colour rename is **deliberately breaking** so that every screen must be revisited rather than silently keeping the old look.

Everything else is unguarded by construction: there is no React test harness, and `vitest` only collects `src/**/*.test.ts`.

**Therefore per-screen simulator verification is a required step of each screen's work, not a checklist at the end.** Manual verification has been skipped for four consecutive plans; this design makes it part of the definition of done for every screen.

## 7. Scope

**In:** `theme.ts`, four primitives, `FeedCard`, eight screens, `expo-haptics`.

`expo-haptics` needs no config plugin and no native rebuild.

**Out:** dark mode (doubles every decision); bundled fonts (the scale carries the direction, and a face can land later without touching layout); the receipt template's internal layout (a separate 1080px render target with its own type scale — it adopts the colour roles and keeps its sizes); any domain, query, or schema change.

## 8. Risks

**A half-finished token migration looks worse than either end state.** The rename touches every screen at once. Mitigation is ordering: tokens and primitives land and are verified first, then screens convert one per commit, each independently runnable.

**The aesthetic swing is large and global.** Removing every pill and box is not reversible screen by screen once the tokens change. Mitigation: the feed converts first and is judged on its own before the remaining seven follow.

**Editorial layouts are unforgiving of long strings.** Wide type at 34pt overflows readily; the receipt already needed shrink-to-fit and truncation for exactly this reason. Every `display`-size string that comes from user input needs a defined overflow behaviour rather than a hope.

## 9. Open items

- **The composer is now a single-field screen.** With caption and rating removed it holds a title and a publish button. Whether it still earns being its own screen is a product question this design does not settle.
- **`caption` and `rating` remain in the schema with nothing writing them.** The receipt renders a rating row that can no longer be populated; spec §2 of the product design still calls for a caption on the card.
- **No cover photo is ever written by default**, so the feed's photo path stays the exception rather than the rule until something changes that.
