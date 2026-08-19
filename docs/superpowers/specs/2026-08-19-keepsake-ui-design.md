# Keepsake UI — Design

**Status:** approved 2026-08-19. Supersedes `2026-08-14-nocturnal-ui-design.md`.

**Phase 1 of 2.** This spec covers the visual system only. Memory sections — "one year ago
today", streaks, milestones, a favourites shelf — are Phase 2 and get their own spec, because
they need new domain queries and analytics rather than new styling.

---

## 1. Why the current UI reads bland

Three measured causes, not taste:

1. **No typeface is loaded.** `expo-font` is a dependency but is never called. Every screen
   renders in iOS system font. SF Pro is what an app looks like when nobody chose a font, and
   it is most of why the app reads as "normal".
2. **The layers barely separate.** Ground `#121016` against surface `#1E1B24` is roughly a 6%
   lightness step, with no border, shadow or texture. "Pale" and "empty" are literal
   descriptions of cards that do not visibly sit on anything.
3. **The personal content is below the fold.** The thesis is a shareable wall of dates, but the
   calendar became the default view, so the first screen is a search field, a spending card and
   a grid of numbers. Nothing on the opening screen belongs to this couple specifically.

The third is the important one. The app looks like a competent expense tracker because, on
open, that is exactly what it shows.

## 2. Direction

**A keepsake that's ours.** Warm, photo-forward, intimate. The money is in service of the
memory, not the other way round.

Two constraints carried from earlier decisions and not up for renegotiation here:

- **Not pastel.** Warmth comes from deep, saturated colour, never from tints.
- **The warm-red accent survives.** Crimson in light, coral in dark.

## 3. Typography

**Nunito**, loaded through `expo-font`. Rounded sans: soft letterforms against a firm ground
read as cosy rather than sugary, which is what keeps this side of pastel.

| Role | Size / line height | Weight | Tracking |
| --- | --- | --- | --- |
| `display` | 34 / 38 | 800 | 0 |
| `title` | 22 / 28 | 800 | 0 |
| `body` | 16 / 24 | 400 | 0 |
| `meta` | 13 / 18 | 600 | 0 |
| `micro` | 11 / 14 | 700 | 1.5 |

Rounded faces read lighter than grotesks at the same weight, so headings step up to 800 where
the previous scale used 600–700. Weights 400/600/700/800 ship; anything else is a substitution
and must not be referenced.

**Fonts must load before first paint.** A flash of system font followed by Nunito is worse than
either alone. The root layout holds the splash screen until `useFonts` resolves.

## 4. Colour

Two complete themes. Not a tint of one another — day is paper, night is moonlight.

### 4.1 Light — Sepia album

| Token | Value | Note |
| --- | --- | --- |
| `ground` | `#EFE4D4` | aged paper |
| `surface` | `#FBF4EA` | the card |
| `surfaceSunk` | `#F5EBDC` | wells, inputs |
| `line` | `#E0CFB4` | hairlines, mat borders |
| `ink` | `#2A2018` | 12.7:1 on ground |
| `inkMuted` | `#6B5A47` | 5.3:1 on ground |
| `primary` | `#A61B34` | crimson, 5.9:1 on ground |
| `onPrimary` | `#FFFFFF` | 7.4:1 on crimson |

`inkMuted` is `#6B5A47`, not the `#7E6B57` shown during brainstorming: that measured 4.0:1 and
failed AA for body text.

### 4.2 Dark — Warm midnight

| Token | Value | Note |
| --- | --- | --- |
| `ground` | `#121420` | night blue, warmed off pure slate |
| `surface` | `#1E2130` | the card |
| `surfaceSunk` | `#181B27` | wells, inputs |
| `line` | `#2C3040` | hairlines, mat borders |
| `ink` | `#EFEDF5` | 15.8:1 on ground |
| `inkMuted` | `#9A9AAE` | 6.6:1 on ground |
| `primary` | `#FF8A5C` | coral, 7.9:1 on ground |
| `onPrimary` | `#1A1206` | 8.0:1 on coral |

The accent inverts on purpose. Crimson on a midnight ground measures under 3:1 and cannot carry
a filled button; coral is the same warm-red family tuned to its ground.

### 4.3 Kind colours

Six kinds, two sets. Both stay clear of red so the accent owns that end of the spectrum alone —
the same rule that governed the previous palette.

| Kind | Light | Dark |
| --- | --- | --- |
| `food` | `#8A5E0A` | `#F5C242` |
| `transport` | `#2F7D4F` | `#6BD97F` |
| `activity` | `#17706B` | `#3DD6C4` |
| `shopping` | `#2A5DA8` | `#5B9DFF` |
| `gift` | `#7A3FA8` | `#C77DFF` |
| `other` | `#6B5A47` | `#9A9AAE` |

Every kind clears 4.5:1 against its own `surface`. That is the bar rather than 3:1 because a
kind colour is used as chip *text* at 11pt, not merely as a graphic fill — the first light-mode
gold chosen, `#B07A12`, measured 3.41:1 and was rejected for exactly this reason.

Kinds **outline** chips and **fill** bars, never the reverse. Filled cool chips beside a solid
accent button turn a card into competing colour masses.

### 4.4 Theme switching

A manual toggle, not the system setting — the user asked to choose. The choice persists in a
new `app_settings(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)` table in the existing
database. No new dependency, and it is local-first like everything else.

Default on first launch is light.

## 5. Material

### 5.1 Inset mat

A photo sits matted inside its card rather than bleeding to the card's edge:

- card border: 1px `line`
- photo inset: 6pt on all sides
- photo radius: 10; card radius: `radius.lg`

This reads as a framed print. It is the one ornament that carries the keepsake feeling without
tipping into scrapbook pastiche — no fake tape, no torn edges, no simulated stitching.

### 5.2 Lift

Cards sit above the ground rather than being drawn on it.

**Light:** `shadowColor '#3A2A18'`, offset `{0, 2}`, radius 8, opacity 0.12, elevation 2.

**Dark:** no shadow. A shadow on a near-black ground is invisible, and faking it with a glow
looks like a bug. Depth in dark mode comes from the surface being lighter than the ground plus
the 1px `line` border.

This split is deliberate and must not be "unified" into one shadow token.

### 5.3 Radii

`sm 8 · md 12 · lg 18 · xl 24`. Rounder than the previous 6/10/14, because rounded letterforms
against sharp containers read as a mismatch.

## 6. The calendar becomes a mosaic

The default Dates view stays the calendar — but a day holding a date shows **that date's cover
photo** filling the cell, not a coloured dot. A month becomes a mosaic of the couple's own
pictures, which is how the navigation itself turns personal.

- Cell radius `radius.sm`; photo fills the cell.
- The day number sits on the photo with a scrim behind it, because a number on an arbitrary
  photograph is otherwise unreadable. The scrim is a solid `rgba(0,0,0,0.45)` disc behind the
  numeral, not a full-cell overlay that would dull the picture.
- A date with no cover photo keeps the current treatment: kind-tinted wash plus a dominant-kind
  dot.
- Today keeps its accent ring, drawn *outside* the photo so it survives on any image.

Needs one new query: cover photo per day for a month, scoped by couple and currency like every
other analytics read, through the shared `monthScope` predicate.

## 7. Feed rhythm

The feed below the calendar stops being a uniform column.

- **Hero:** the newest published date renders full-bleed — 16:9 cover, title and meta over a
  bottom scrim.
- **Grid:** every older date renders as a two-up matted card.

Varying the card size is what stops the feed reading as empty *and* stops it reading as
monotonous. Uniform cards at any single size fail one or the other.

Month grouping and date search, both already built, are unchanged.

## 8. Richer cards

Every date card carries what the app already knows and currently throws away:

- the stop timeline as a row of kind icons in stop order — the shape of the evening at a glance
- place names, joined, truncated to one line
- who paid, when more than one person has
- stop count and total, as now

No new data. Every field above already exists on `FeedDate` or one join away.

## 9. Motion

- Card press: scale to 0.985 over `motion.fast`, as now.
- Screen transitions and card entry: `motion.base`, ease-out.
- Haptics on commit and selection, as now.

Rounded, warm and physical invites springy motion; it is deliberately **not** adopted. Spring
animation on every card is the kind of ornament that reads as charming twice and irritating
thereafter, and it is expensive to tune. Revisit only if the static design lands and still feels
inert.

## 10. Boundaries

- `src/domain/**` stays free of react, react-native and expo imports. Themes are UI, not domain.
- No component reads a raw hex. Every colour comes from the active theme.
- Both themes expose **identical** token keys. A key present in one and missing from the other
  is a build error, not a runtime fallback.

## 11. Testing

Mostly pure functions, tested in plain Node as the rest of the codebase is.

1. **Contrast is asserted, not eyeballed.** A test computes WCAG ratios across both themes and
   fails if `ink`/`inkMuted` on `ground` or `surface` drops below 4.5:1, if `onPrimary` on
   `primary` drops below 4.5:1, or if `primary` on `ground` drops below 3:1. This is the guard
   that stops a future palette tweak quietly breaking legibility.
2. **Theme completeness.** Light and dark are asserted to have identical key sets, recursively.
3. **Kind coverage and contrast.** Every `StopKind` has a colour in both themes, and every one
   clears 4.5:1 against its theme's `surface`, since kind colours render as chip text.
4. **The per-day cover query** gets the same treatment as the other analytics reads: couple
   scoping, currency scoping and tombstones each proven by a mutation that must fail a test.
5. **Hero selection** — newest published date, excluding drafts and tombstoned dates — is a pure
   function over a list, tested directly.

Pixel tests are out, as they were before: flaky, and they assert the wrong thing.

## 12. Out of scope

- **Memory sections** — Phase 2, separate spec.
- **Springy motion** — see §9.
- **Handwriting, tape, torn edges, film sprockets, perforation.** Considered and rejected; the
  inset mat is the single ornament.
- **Following the system colour scheme.** A manual toggle was chosen instead.
- **Redesigning the receipt export.** It already has its own visual language and is not part of
  this work.
