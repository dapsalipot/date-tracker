# Nocturnal UI — Design

*Supersedes the editorial-print direction previously recorded here. That version was built and rejected: it read as a magazine page rather than a mobile app, and stripping ornament to fight AI-slop produced screens that were bare rather than designed. What follows replaces it.*

## 1. Thesis

Two failure modes bracket this app.

The original was **slop**: white rounded boxes on cream, filled pills everywhere, no type scale (every `fontSize` an inline magic number), and no motion. Uniform containers, weak hierarchy, no point of view.

The first attempt at a fix was **bare**: hairline rules, no surfaces, no colour, one huge photo per screen. It removed the slop and put nothing in its place.

The answer is neither. **Anti-slop is specificity, not subtraction** — density that carries meaning. This direction is a dark, dense, unmistakably-mobile app whose richness comes from a colour system doing real work: six spending kinds, each with its own hue, colouring the feed and the dashboard so both are legible at a glance.

**Dates happen at night.** A dark ground is honest to when the app is used, flatters photographs, and lets saturated accents read without becoming candy.

## 2. Decisions

| Area | Decision |
|---|---|
| Ground | Near-black `#121016`. Cards sit above it |
| Second colour | `#FF6B4A` orange-red, promoted to brand tier |
| Kind colours | Six hues, cool-shifted, outline-only |
| Density | Photo thumbnails, stop chips, segmented bars, sparklines |
| Typeface | System sans with a real five-step scale. No bundled fonts |
| Motion | Restrained: press-in, screen push. No decorative motion |
| Haptics | `expo-haptics` on commit actions |
| Receipt export | **Stays light.** Deliberate split |

**Guiding principle:** *every colour must carry information.* A hue that only decorates is the slop this replaces.

## 3. Colour

### Surfaces and text

| Role | Hex | Use |
|---|---|---|
| `ground` | `#121016` | The floor. Nothing else is this dark |
| `surface` | `#1E1B24` | Cards. The original brand plum, demoted from ground to surface |
| `line` | `#2C2833` | Hairlines, empty bar tracks |
| `ink` | `#F5F2EE` | Primary text |
| `inkMuted` | `#8A8290` | Secondary text, labels |

The original plum `#1F1A24` becomes the **card surface**, not the ground. On a dark UI the floor must sit below the cards; using the brand plum as the floor left nothing for cards to rise from.

### Brand

| Role | Hex | Use |
|---|---|---|
| `primary` | `#FF6B4A` | Actions, key numbers, active tab, FAB, selection |
| `onPrimary` | `#1A0A05` | Text on a primary fill |

`primary` is the **second brand colour**, not an accent tint. It carries the budget number, the Save button, the FAB, and the active tab underline. **No kind may use it** — a kind wearing the action colour collapses the distinction between "what this is" and "what you can do".

### Kinds

Six kinds, six hues, cool-shifted so warm-red stays the brand's alone.

| Kind | Hex |
|---|---|
| `food` | `#F5C242` |
| `transport` | `#6BD97F` |
| `activity` | `#3DD6C4` |
| `shopping` | `#5B9DFF` |
| `gift` | `#C77DFF` |
| `other` | `#8A8290` |

**Kind colours never fill a chip — they outline it.** Filled cool chips beside a solid orange button turn a card into five competing colour masses. Outlines keep kinds legible as categories while `primary` remains the only solid warm area on screen.

Kind colours **do** fill bars and bar segments, where the fill *is* the data.

`gold` is dropped. It had one job in the old direction and none here.

## 4. Type

Unchanged from the previous direction — the hierarchy was never the objection.

| Token | Size / line | Extra |
|---|---|---|
| `display` | 34 / 36 | — |
| `title` | 22 / 28 | — |
| `body` | 16 / 24 | — |
| `meta` | 13 / 18 | — |
| `micro` | 11 / 14 | +1.5 letterspacing, uppercase |

Guarded by `src/ui/theme.test.ts`: strictly descending, `body < 0.5 × display`, title distinct from both neighbours, letterspacing on `micro` and nowhere else.

## 5. Density

The bare version failed because removing caption and rating left cards holding a date, a title and one meta line. Density returns as **information**, not ornament:

- **Photo thumbnails** — a 3-up strip with `+N` overflow rather than one full-bleed image. Two dates per screen instead of one.
- **Stop chips on the feed card** — `Dessert · Cinema · Flowers`, outlined in kind colours. This is what the date *was*, and it fills exactly the space caption and rating vacated.
- **Segmented budget bar** — the month's spend split by kind rather than one flat fill, so the headline number and its breakdown are one object.
- **Sparkline trend** — twelve months at a glance with the current month in `primary`.

Cards return, with radius, on the dark ground. The old white-on-cream invisibility is solved by the ground being darker than the card, not by borders.

## 6. Motion and haptics

`duration.fast: 120`, `duration.base: 220`. Press-in scale on every interactive surface, via a shared `Button` so consistency is structural. `tap()` on press, `commit()` on a completed write. One module imports `expo-haptics`; nothing else may.

## 7. The receipt stays light

The app is dark; the exported receipt keeps its cream ground.

A receipt is posted to Instagram, where a near-black rectangle reads as a mistake. The export is a separate render target at a fixed 1080px with its own type scale, and it adopts **none** of the dark roles. This split is deliberate and must not be "fixed" for consistency.

## 8. What survives from the previous attempt

The type scale, `src/ui/theme.test.ts`, `src/ui/feedback.ts`, `Screen`, `MicroLabel`, `Button` and the reanimated babel plugin all stand. Only their colour values change.

`Rule` becomes near-vestigial — this direction separates with cards and space, not hairlines. It stays for the few dividers inside cards.

The already-converted feed must be **redone**: it was built for the editorial direction and is wrong in layout as well as colour.

## 9. Testing

**Zero domain changes. All 186 tests must stay green, untouched.**

`tsc` is the migration's real guard: renaming the colour roles breaks every call site, and each error names a file that must be revisited. `layout.test.ts` (8 tests) protects the receipt's arithmetic while its colours change.

No screen is reachable by any test — `vitest` collects only `src/**/*.test.ts` and there is no React harness. **Per-screen simulator verification is part of the definition of done**, not a checklist at the end.

## 10. Risks

**A dark redesign is hard to judge from a screenshot.** Contrast that looks fine on a bright monitor can be unreadable at low brightness. Every screen check should include the simulator at reduced brightness.

**Six kind colours is a lot of colour.** The discipline that keeps it from becoming a rainbow is that kinds only ever outline chips or fill bars — never fill a surface, never colour text outside a chip.

**Dark ground plus photos is unforgiving.** A dark photo on a dark card disappears. Thumbnails need a subtle `line`-coloured edge or a minimum luminance treatment; this needs checking against real photos, not placeholder blocks.

**The conversion is global.** Every screen changes at once when the roles rename. Feed converts first and is judged alone before the rest follow.

## 11. Open items

- **The composer is a single-field screen** since caption and rating were removed. Whether it earns being its own screen is unresolved.
- **`caption` and `rating` remain in the schema with nothing writing them.** The receipt renders a rating row that can no longer be populated.
- **No cover photo is written by default**, so the thumbnail strip is empty for most dates until something changes that. The `+N` overflow only appears for dates with three or more photos.
