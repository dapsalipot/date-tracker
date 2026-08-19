# Memories — Design

**Status:** approved 2026-08-20.

**Phase 2 of 2.** Phase 1 (`2026-08-19-keepsake-ui-design.md`) rebuilt the visual system and
shipped. This spec covers the memory features that were split out of it, plus one prerequisite
they turned out to require.

---

## 1. What this is for

The app records dates well and shows them back as a calendar and a feed. What it does not do is
notice anything. A keepsake that only ever replays what you typed is a filing cabinet; one that
occasionally says "a year ago today you were at the waterfall" is worth opening when you have no
particular reason to.

Four sections, one screen.

## 2. Prerequisite: dates can be moved

**Nothing in the app can change a date's day.** `captureStop` assigns today via the implicit open
date, and `DateDetails` carries title, caption, rating, cover and location — no `occurredOn`. A
date is stuck on the day it was captured, forever.

This blocks everything below. Three of the four sections need history, and history has to be
enterable. It is also an everyday defect in its own right: a dinner logged the following morning
is filed on the wrong day and cannot be corrected.

- `DateDetails` gains `occurredOn?: string` (ISO `YYYY-MM-DD`).
- The compose screen gains a date field with a picker.
- **Future dates are rejected.** v1 is a journal, not a planner; a date that has not happened has
  no stops and would sort above real memories.
- Nothing else changes. The feed, the calendar and every analytics read already key on
  `occurredOn`, so a moved date relocates itself.

## 3. On this day

Dates whose `occurredOn` shares today's month and day, in any earlier year, newest first.

```
substr(occurredOn, 6, 5) = substr(:today, 6, 5) AND occurredOn < :today
```

Couple-scoped and tombstone-aware like every other read. Published only — a draft from last year
is an abandoned capture, not a memory.

**Empty until the app is a year old.** The section hides completely rather than rendering an
empty card. A permanent "nothing yet" is worse than an absence nobody notices.

## 4. Streak

Consecutive ISO weeks containing at least one published date, counted back from the current week.

- **Current streak** — runs back from this week. This week counts as alive if it contains a date;
  if it does not, the streak is measured to last week and the UI says so rather than showing 0.
- **Longest streak** — the best run in the whole history, so a broken streak leaves something
  behind rather than resetting to nothing.

**A week runs Monday to Sunday**, and two dates belong to the same week when they fall in the
same Monday-anchored seven-day span. This has to be stated because it is otherwise the kind of
thing each implementer decides differently: a Sunday-start week moves every boundary by a day and
silently changes what counts as a break. The couple's local day is what matters, not UTC —
`occurredOn` is already a local `YYYY-MM-DD` string, so the calculation stays in string space and
never touches a timezone.

A pure function over a sorted list of `occurredOn` strings. No SQL beyond fetching the dates,
which means it is tested in plain Node with no database.

Weekly, not daily or monthly: daily is absurd for a couple, monthly is so forgiving the number
stops carrying information. A week with no date ends the run.

**Always shown.** Unlike the other sections it is honest at any size — "1 week" is a true and
unembarrassing thing to display.

## 5. Milestones

A fixed set. Not an extensible engine — a configurable milestone system is the kind of thing that
looks cheap and is not, and "add the 500th stop" is later a line of code rather than a framework.

| Milestone | Rule |
| --- | --- |
| First date | The earliest published date |
| Every 10th | The 10th, 20th, 30th… published date by `occurredOn` |
| Most expensive night | Highest total across a single date, in the couple's currency |
| Longest date | Most stops on a single date; ties break to the earlier date |

Each is one query over data that already exists. Milestones not yet reached are absent, not
greyed out — a locked-achievement grid belongs to a different kind of app.

## 6. Favourites

**The `rating` column already exists** on `dates` and `updateDateDetails` already accepts it. No
UI has ever set it. This section gives it a purpose rather than adding a parallel `is_favourite`
flag beside a dormant integer.

- Compose gains a 1–5 heart rating.
- The shelf shows dates rated 4 or more, newest first.

A single favourite toggle would be warmer and less like a review site, but it wastes an integer
column on a boolean and leaves the shelf with no ordering. 1–5 was chosen deliberately; the
trade is recorded here so a later change is a decision rather than a discovery.

**Shown even when empty**, alone among the four, with a prompt to rate a date. It is the only
section that is actionable on day one.

## 7. Placement

A third tab, `Memories`, beside Dates and Spending.

The feed stays about browsing and the dashboard stays about money. Confining the sections to
their own screen also means the early emptiness — three of four sections have nothing to show
until history accumulates — sits somewhere the user can choose not to look, rather than on the
screen that opens on launch.

Order on the screen: On this day, Streak, Milestones, Favourites. Time-sensitive first, since
"on this day" is the only one whose content changes daily and is therefore the only reason to
open the tab on any particular morning.

## 8. Visual language

Phase 1's system applies unchanged: `Card` surfaces, `theme.type` tokens, the active theme's
roles, kind colours outlining chips and filling bars, the photo-overlay constants where text sits
on a photograph.

No new visual concepts. This phase adds screens, not a style.

## 9. Boundaries

- `src/domain/**` stays free of react, react-native and expo.
- Every new query is couple-scoped, respects `deleted_at` on both dates and stops, and is proven
  by a mutation that must fail a test — the pattern established in Phase 1.
- Streak logic is a pure function over strings, tested with no database at all.
- No new dependency. A date picker uses the platform one already available through React Native.

## 10. Testing

1. **Back-dating**: moving a date changes which month the feed and calendar file it under; a
   future date is rejected.
2. **On this day**: matches month-day across years, excludes today itself, excludes drafts,
   excludes another couple's dates, excludes tombstoned dates — each by mutation.
3. **Streak**: a pure-function suite. Consecutive weeks; a gap ending a run; a week with several
   dates counting once; the current week being empty measuring to last week; longest surviving a
   break; an empty history returning zero rather than throwing; and a pair of dates straddling a
   Sunday/Monday boundary counting as two weeks rather than one, which is the assertion that
   pins the Monday-start rule.
4. **Milestones**: the 10th date is the 10th by `occurredOn` and not by insertion order; ties on
   "longest" break to the earlier date; currency scoping on "most expensive".
5. **Favourites**: the 4-or-more threshold, ordering, and that an unrated date never appears.

Pixel tests remain out.

## 11. Out of scope

- **Notifications.** "On this day" is a thing you find, not a thing that interrupts you. Push was
  already a v3 non-goal and stays there.
- **Configurable milestones.** See §5.
- **Sharing a memory as an image.** The receipt export already covers sharing; a second export
  template is its own piece of work.
- **Streak repair, freezes or reminders.** Habit-tracker mechanics. A streak here is an
  observation, not an obligation.
- **Backfilling data on the user's behalf.** §2 makes backfilling possible; entering it is the
  user's own effort and no import path is being built.
