# Couples Date Tracker — Design

**Date:** 2026-08-03
**Status:** Approved for planning
**Working name:** `date-tracker` (product name not yet chosen)
**Platforms:** iOS + Android, React Native via Expo

---

## 1. Thesis

Couples don't track date spending because expense logging feels like chores. This app inverts
the incentive: the user's motivation is to build a beautiful, shareable record of their dates,
and accurate expense data falls out as a **byproduct** of that motivation.

The fusion is structural, not cosmetic. A date is modelled as an ordered **timeline of stops**,
and each stop carries both memory content (place, time, photos, note) and financial content
(amount, category, who paid). Logging for the pretty wall therefore produces clean, correctly
categorised financial records with no separate bookkeeping step.

**What this is not:** a bill-splitting app. There is no debt ledger, no "you owe her ₱340",
no settle-up. Attribution exists for insight, not for accounting.

---

## 2. Product decisions

| Area | Decision |
|---|---|
| Audience | A real product for couples, not a private two-person tool |
| Identity | Two accounts → one shared **Couple** space (tenant pattern) |
| Capture timing | Hybrid: <5s quick-capture during the date, rich compose afterwards |
| Core entity | **Date = ordered timeline of Stops** |
| Partner money | "Who paid" attribution only. No debt ledger, no settle-up |
| Feed rendering | Photo-first card (hero image, thumbnail strip, cost chips, caption) |
| Export rendering | Stylised **receipt** — the expense report *is* the keepsake |
| Export privacy | Money modes `exact` \| `tier` \| `hidden`, defaulting to `tier` |
| Budget | One monthly date budget, live remaining surfaced inside quick-capture |
| Pricing | Free solo → **one purchase unlocks pairing** for both partners |
| Photo storage | Originals stay on the capturing device; ~250KB display copies in cloud |
| Unpair policy | Timeline is snapshotted to **both** members; they diverge from that point |

### Guiding principle

*The app should be closed during the date.* Any feature that increases on-phone time during a
date is working against the product.

---

## 3. Scope & phasing

Each phase is independently shippable and independently useful.

### v1 — Solo, local-only *(this spec covers v1 in implementable detail)*

Full capture → compose → feed → receipt export → dashboard, running entirely on-device via
`expo-sqlite`. **No auth, no server, no sync, no in-app purchase, no network calls.**

This is a complete personal date journal. It is also, deliberately, the free tier.

### v2 — Pairing

Supabase Auth + Postgres, RLS, invite-code pairing, the sync module, R2 media pipeline,
RevenueCat unlock. "Who paid" attribution and partner-visible photos become meaningful here.

### v3 — Product polish

Additional receipt templates, deeper analytics, nudge notifications, unpair-and-export,
duplicate-date detection.

**v1 is written against the couple-shaped schema throughout.** A solo user gets a `couples` row
with exactly one `couple_members` row. Pairing in v2 is an INSERT, not a migration.

---

## 4. Data model

SQLite in v1 (Drizzle ORM); the same shape is mirrored to Postgres in v2.

```
users
  id                text pk
  display_name      text not null
  avatar_uri        text

couples
  id                text pk
  title             text
  anniversary_on    text                    -- ISO date
  currency_code     text not null default 'PHP'
  timezone          text not null           -- IANA, e.g. 'Asia/Manila'
  created_at        integer not null

couple_members
  couple_id         text not null
  user_id           text not null
  joined_at         integer not null
  primary key (couple_id, user_id)

dates
  id                text pk
  couple_id         text not null
  title             text
  occurred_on       text not null           -- ISO date, couple-local
  started_at        integer
  ended_at          integer
  location_label    text
  cover_photo_id    text
  rating            integer                 -- 1..5
  caption           text
  status            text not null           -- 'draft' | 'published'
  created_by        text not null
  updated_at        integer not null
  server_updated_at integer                 -- v2, server-assigned
  deleted_at        integer

stops
  id                text pk
  date_id           text not null
  sort_order        integer not null
  kind              text not null           -- see §5
  subkind           text                    -- see §5, optional
  label             text
  place_name        text
  lat               real
  lng               real
  occurred_at       integer
  amount_minor      integer not null default 0
  currency_code     text not null
  paid_by_user_id   text
  note              text
  updated_at        integer not null
  server_updated_at integer
  deleted_at        integer

photos
  id                text pk
  date_id           text not null
  stop_id           text
  local_uri         text
  remote_key        text                    -- v2
  thumb_key         text                    -- v2
  width             integer not null
  height            integer not null
  taken_at          integer
  upload_state      text not null           -- 'local' | 'uploading' | 'synced'
  updated_at        integer not null
  server_updated_at integer
  deleted_at        integer

budgets
  id                text pk
  couple_id         text not null
  period_month      text not null           -- 'YYYY-MM', couple-local
  amount_minor      integer not null
  updated_at        integer not null
  server_updated_at integer
  deleted_at        integer
  unique (couple_id, period_month)

outbox                                       -- table created in v1 migrations,
  id                text pk                  -- but written to only from v2
  table_name        text not null
  row_id            text not null
  op                text not null           -- 'upsert' | 'delete'
  queued_at         integer not null
```

### v1 local identity

v1 has no authentication. On first launch the app creates one `users` row (device-local id,
display name defaulting to the device name and editable in settings), one `couples` row, and one
`couple_members` row joining them. Every v1 write is scoped to that couple exactly as it will be
in v2 — the only difference is that the membership has one row instead of two.

The `outbox` table is created by the v1 migrations so that v2 needs no schema change, but
repositories do not write to it in v1. There is no server to drain it to, and pairing performs a
full initial push rather than replaying local history.

### Deliberate choices

- **`amount_minor` is an integer in centavos. Money is never a float.** `0.1 + 0.2 !== 0.3` in
  JavaScript; a tracker reporting ₱2,339.9999 destroys trust in every chart. Formatting happens
  only at the display edge, in `domain/money`.
- **`updated_at` and `deleted_at` exist from v1** even though nothing reads them yet. They are
  the watermark and tombstone columns the v2 sync engine requires. Adding them now is free;
  backfilling them later is not.
- **`server_updated_at` is assigned by Postgres in v2, never by the device.** Device clocks
  drift and get manually changed; a phone set three hours fast would win every conflict forever,
  producing a bug that is effectively impossible to reproduce.
- **`currency_code` sits on the stop, not only the couple**, so a trip abroad does not corrupt
  the couple's spending history.
- **`timezone` on `couples`** because month boundaries — and therefore the entire budget
  feature — are meaningless without one.
- **Deletes are tombstones.** Hard deletes cause a row deleted on one device to resurrect from
  the other on next sync.

### Month attribution rule

A stop's spend is attributed to the month of its parent **`dates.occurred_on`**, not to
`stops.occurred_at`. A date that runs past midnight therefore counts entirely in one month.
This keeps "this date cost ₱2,340" consistent between the receipt and the dashboard.

---

## 5. Stop taxonomy

Two levels. **Top-level `kind` is chosen during quick-capture** (6 chips, ordered by recent use).
**`subkind` is optional and set in the composer**, never required.

| kind | subkinds |
|---|---|
| `food` | `restaurant`, `cafe`, `dessert`, `street`, `groceries` |
| `transport` | `grab`, `fuel`, `toll`, `parking`, `jeep`, `bus` |
| `activity` | `tickets`, `movie`, `videoke`, `sports`, `event` |
| `shopping` | `clothes`, `books`, `home`, `other` |
| `gift` | `flowers`, `jewelry`, `surprise` |
| `other` | *(none)* |

Charts group by `kind` by default and drill down to `subkind`. Adding a subkind later does not
invalidate history, because every historical row still has a valid `kind` — this is the whole
reason for the two-level structure.

`subkind` may be **pre-selected by inference** (e.g. a `place_name` of "Bo's Coffee" suggests
`food/cafe`), because a wrong guess is cheap once the user has already chosen `kind` deliberately.
`kind` itself is never inferred.

---

## 6. Architecture

Approach A: **Expo + local SQLite as the source of truth, thin hand-rolled sync in v2.**

This rejects a local-first sync vendor deliberately. A couple generating ~50 dates/year at
~4 stops each produces ~200 rows/year — under 2,000 rows after a decade. At that size a naive
watermark sync is genuinely correct rather than a shortcut, and conflicts are overwhelmingly
*appends* by different people rather than simultaneous edits of the same field. Last-write-wins
is honest here. Firestore was rejected because the analytics dashboard is the product's payoff
and Firestore cannot aggregate without hand-maintained rollup documents.

### Module layout

```
app/                        Expo Router: routes only, deliberately thin
  (tabs)/index.tsx            feed
  (tabs)/dashboard.tsx        analytics
  (tabs)/settings.tsx
  capture.tsx                 quick-capture modal
  date/[id]/index.tsx         date detail
  date/[id]/compose.tsx       rich composer
  date/[id]/share.tsx         receipt preview + export

src/
  db/          schema.ts · migrations/ · client.ts
  domain/
    money/     Money type, minor-unit math, ₱ formatting, tier thresholds
    dates/     repository, draft lifecycle
    stops/     repository, taxonomy
    budget/    monthly period math, live-remaining calculation
    analytics/ aggregation queries (SQL, typed results)
  media/       capture · compress/resize · local file store
  render/
    FeedCard.tsx                    render target 1
    receipt/ReceiptCanvas.tsx       render target 2 (Skia)
    receipt/templates/
    receipt/export.ts               canvas → PNG → share sheet
  ui/          primitives, theme tokens
  fixtures/    seeded 12-month couple history for development
```

### Boundary rules

1. **`src/domain/**` imports nothing from React.** Pure TypeScript over the Drizzle client. This
   is what makes budget math, tier computation and every analytics aggregation unit-testable in
   milliseconds with no simulator. A single `useState` in `domain/` forfeits that permanently.
2. **Analytics are written as SQL, not JavaScript `.reduce()`.** The same
   `GROUP BY kind, month` runs unchanged against Postgres in v2. Aggregation logic living in JS
   would have to be duplicated server-side or force shipping every row to the client forever.
3. **`render/receipt` is the only module aware that Skia exists.** Everything else calls
   "make me a shareable image of this date" and receives a file URI.
4. **Routes are thin.** They call hooks that call repositories; they contain no domain logic.

### Reactivity

Drizzle's `useLiveQuery` re-runs a query when its underlying tables change, so the feed and the
live-remaining badge update automatically after a capture. **No Redux, no Zustand, no cache layer
— SQLite is the store.** In v2 the sync module writes to SQLite and every screen updates for free.

---

## 7. Key flows

### 7.1 Quick-capture (target: under 5 seconds from cold open)

Entry points: FAB in the feed, and a home-screen shortcut.

The sheet opens with the **amount keypad already focused**. Below it: six `kind` chips ordered by
recent use, and an optional camera button. One tap saves.

**The implicit open date is what makes 5 seconds possible.** The user never picks a date first.
On save:

- If a `draft` date exists for today (couple-local), append the stop to it. If more than one
  does, use the most recently updated — the user never disambiguates during capture.
- Otherwise create one silently — `status='draft'`, `occurred_on=today`, untitled — and append.

Writes go to SQLite and the local filesystem only. There is no network path in v1.

### 7.2 Date lifecycle

```
(nothing) --capture--> draft ---------compose--------> published
                         ↑                                  |
                         └── "2 dates waiting" strip         └──> export image
```

A **draft** is a date with money but no story. The feed shows published dates as photo-first
cards with unfinished drafts pinned in a slim strip at the top. That strip is the retention
mechanic; v1 ships no push notifications.

### 7.3 Compose

Reorder stops, set title / cover / caption / rating, drag photos onto stops, set `paid_by`
(v1: always the single local user), optionally set `subkind` and `place_name`.

### 7.4 Export

Four steps; only the last two touch the device.

1. `buildReceiptViewModel(date, moneyMode)` — a **pure function** in `domain/`. Produces line
   items, totals, per-person subtotals and tier symbols.
2. A template selects a layout for that view model.
3. Skia renders offscreen at exactly **1080×1350** (post) or **1080×1920** (story).
4. `makeImageSnapshot()` → PNG → temp file → `expo-sharing`.

Step 1 being pure is the point: the exported *content* is asserted in plain unit tests with no
renderer involved. The export is a separate component tree from `FeedCard`, not a screenshot of
it — a layout designed for a 390pt phone breaks when scaled to 1080px.

### 7.5 Money modes

| Mode | Behaviour |
|---|---|
| `exact` | Real amounts, formatted `₱2,340` |
| `tier` *(default)* | `₱` / `₱₱` / `₱₱₱` per line; grand total hidden |
| `hidden` | No monetary content at all |

**Tier computation:** terciles of per-stop cost **within each `kind`**, over the couple's own
trailing 12 months — so ₱₱₱ coffee and ₱₱₱ dinner correctly mean different peso amounts.

Tiers are computed at export time and **never persisted**. A shared image is an immutable
artifact of that moment; the app makes no promise that a symbol is stable as history grows.

**Insufficient-history rule:** if a `kind` has fewer than 6 non-deleted stops in the trailing
12 months, that line falls back to `hidden` rather than showing a tier derived from noise.

---

## 8. Dashboard (v1)

One screen, answering "what did we spend, and where can we save", in this order:

1. **This month** — spend vs. budget as a single bar, with remaining amount and days left.
2. **Where it went** — spend by `kind` for the selected month, ranked descending, with each
   bar drillable to `subkind`.
3. **Trend** — total date spend per month for the trailing 12 months.
4. **Per-date average** — mean cost per date this month vs. the trailing 12-month mean. This is
   the single most actionable "are we creeping up" number.
5. **Most expensive places** — top 5 `place_name` values by total spend.

Period selection is a month stepper. All five are single SQL aggregations over
`dates ⋈ stops`, scoped to the couple and excluding tombstoned rows.

---

## 9. v2 sync design *(architected now, built later)*

**Pull** — per table, `WHERE server_updated_at > watermark`, applied to SQLite inside one
transaction, then advance the watermark. A couple's entire history is a few hundred KB.

**Push** — every domain repository write appends to `outbox` **in the same transaction** as the
row write, so a crash can never leave a change both applied and unrecorded. Push drains the
outbox in order.

**Conflict** — last-write-wins per row, compared on server-assigned `server_updated_at`.

**Pairing** — A requests a short-lived, server-issued invite code; B enters it; the server
inserts B into `couple_members`. Because dates are already couple-scoped, B's existing solo
dates merge with a single `UPDATE ... SET couple_id`, offered once as an all-or-nothing prompt:
*"Bring your 14 existing dates into the shared timeline?"*

**Authorization** — Postgres RLS: every policy checks that `auth.uid()` is a member of the row's
`couple_id`. Authorization is declarative rather than hand-checked per endpoint.

**Media** — capture writes the local file and a `photos` row at `upload_state='local'`. A
background task compresses to 1600px WebP (~250KB) and PUTs to R2 via a presigned URL. The
partner's device pulls the row and lazily downloads the display copy on first view, then caches
it. **Originals never leave the device that took them** — the OS already backs up the camera roll,
so the app stores a display copy, not an irreplaceable file.

**Accepted limitation:** if both partners logged the same real-world date before pairing, two
entries result. Manual merge only; duplicate detection is deferred to v3 rather than guessed at.

---

## 10. Error handling

In a local-first app most "errors" are states, not failures. Offline is the normal condition
between syncs. **The user is never blocked by anything that is not their fault.**

| Failure | Handling |
|---|---|
| Offline capture | Not an error. v1 has no network path at all |
| Photo upload fails (v2) | Exponential-backoff retry queue; subtle "3 pending" chip in settings; never blocks feed or export |
| Sync fails (v2) | Silent retry. Budget widget shows *"as of 2h ago"* rather than presenting stale data as fact |
| Skia export fails (low memory) | Photos are downscaled **before** compositing; catch, offer retry |
| Device storage full | Hard error at capture with a clear message |
| Photo permission denied | Degrade gracefully — dates without photos are fully valid |
| DB migration fails | Recovery screen with an **"export my data"** action, never a bricked app. Migrations are forward-only |
| Purchase restore (v2) | RevenueCat restore, reachable from settings without signing in |

**Unpair policy (v2/v3):** the shared timeline is snapshotted to **both** members; each keeps a
full copy and they diverge from that point. Nobody loses their memories and nobody negotiates
custody of a photo album. Costs a row-duplication routine; avoids the worst support conversation
this product could generate.

---

## 11. Testing strategy

Deliberately bottom-heavy — possible only because `domain/` contains no React.

- **Unit** *(the bulk; no simulator; milliseconds)* — minor-unit money math, ₱ formatting, tier
  computation including the insufficient-history fallback, monthly budget remaining, the receipt
  view-model builder, and every analytics aggregation against an in-memory SQLite.
- **Integration** *(real SQLite file)* — draft lifecycle; "capture with no open date creates one";
  "capture with two drafts for today picks the most recently updated"; month attribution across a
  date that runs past midnight.
- **Sync convergence** *(v2)* — two in-memory clients and a fake server, asserting convergence
  under reordered and duplicated delivery, plus the atomicity guarantee that a row write and its
  outbox entry land in the same transaction. This is where the real bugs will be.
- **Component** *(thin)* — feed card renders a fixture; capture sheet submits.
- **Receipt export** — assert the **view model**, not pixels. Cross-device pixel snapshots are
  flaky and train developers to ignore failures. Visual verification is a manual step against a
  fixture date.

**`src/fixtures/` ships a seeded 12-month couple history.** Without it the dashboard cannot be
developed without hand-logging fifty dates, and charts get shipped having only ever been seen
with three data points.

---

## 12. Stack

**v1**

- Expo (current SDK) with **development builds via EAS** — the app cannot run in Expo Go, because
  Skia, SQLite, and camera all require native modules
- `expo-router`
- `expo-sqlite` + `drizzle-orm` + `drizzle-kit`
- `@shopify/react-native-skia` — chosen over `react-native-view-shot` because Skia renders to an
  offscreen canvas at an exact pixel size regardless of device DPI, so the same date exports
  identically on a budget Android and an iPhone Pro
- `expo-camera` / `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`,
  `expo-sharing`, `expo-haptics`
- `date-fns`

**v2**

- `@supabase/supabase-js` — Postgres, Auth, RLS
- Cloudflare R2 via presigned URLs — chosen for **zero egress fees**, which is what makes a
  one-time-purchase product with unlimited photos economically sound
- `react-native-purchases` (RevenueCat) — `expo-in-app-purchases` is deprecated

---

## 13. Success criteria (v1)

1. Logging a stop takes **under 5 seconds** from cold app open, measured on a mid-range Android.
2. Composing and exporting a receipt takes **under 60 seconds**.
3. The dashboard answers "what did we spend last month and on what" **on one screen without
   scrolling**.
4. Both partners log **four consecutive dates without being reminded**. This is the only
   criterion that actually validates the thesis.

---

## 14. Non-goals

Explicitly out of scope, and not deferred-with-intent unless stated:

- **Bill splitting, debt balances, settle-up.** Structurally rejected, not deferred.
- **Places/maps API integration.** `place_name` is free text in v1; adding a places provider
  means API keys, quotas and recurring cost for marginal benefit at this stage.
- **Push notifications.** The draft strip is the v1 nudge. Deferred to v3.
- **Web or tablet layouts.** Phone only.
- **Multi-couple support** (one user in several couple spaces). Not modelled.
- **Importing bank or e-wallet transactions.** Manual entry only.
- **Duplicate-date detection on pairing.** Deferred to v3.
- **Social features** — following other couples, in-app feeds, comments. The share target is
  Instagram, not this app.

---

## 15. Open items for the implementation plan

These are decisions with no correct answer at design time; they are resolved during
implementation, not left ambiguous in the spec.

- **Product name.** Working name `date-tracker`.
- **Price point.** One-time purchase. Does not block v1, which ships no purchase flow at all;
  the figure is set before v2 store submission.
- **Visual system.** The mockups used a starting direction — plum-black `#1F1A24`, terracotta
  rose `#E8927C`, cream `#FFFBF7`, gold `#C9A227`. Treated as a starting point for v1, not a
  locked brand.
