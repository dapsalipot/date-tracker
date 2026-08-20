import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@/db/client';
import { publishedDatesQuery } from '@/domain/dates/drafts';
import type { FeedDate } from '@/domain/dates/repository';
import { favourites } from '@/domain/memories/favourites';
import { milestones, type Milestone } from '@/domain/memories/milestones';
import { onThisDay } from '@/domain/memories/onThisDay';
import { weekStreak } from '@/domain/memories/streak';
import { FeedCard } from '@/render/FeedCard';
import { getAppDeps, getLocalContext } from '@/session';
import { Card } from '@/ui/Card';
import { MicroLabel } from '@/ui/MicroLabel';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';

function openDate(date: FeedDate) {
  router.push(`/date/${date.id}`);
}

/** One FeedCard per row, stacked — a memories list reads better as a single
 * column than the feed's two-up grid, and this keeps each entry full width. */
function DateStack({ dates }: { dates: readonly FeedDate[] }) {
  return (
    <View style={{ gap: theme.space.sm, marginTop: theme.space.sm }}>
      {dates.map((date) => (
        <FeedCard key={date.id} date={date} onPress={() => openDate(date)} />
      ))}
    </View>
  );
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: theme.space.sm }}>
      <Text style={{ ...theme.type.meta, color: t.role.inkMuted }}>{milestone.label}</Text>
      <View style={{ marginTop: theme.space.xs }}>
        <FeedCard date={milestone.date} onPress={() => openDate(milestone.date)} />
      </View>
    </View>
  );
}

/**
 * "3 weeks" reads honestly at any size. When this week is still empty the
 * count already measures the run up to last week (see `weekStreak`'s own
 * doc comment) — the caption below says so, so the headline number never
 * looks like a streak that just broke.
 */
function weekWord(n: number): string {
  return n === 1 ? '1 week' : `${n} weeks`;
}

export default function Memories() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const listBottomInset = theme.tabBarHeight + insets.bottom + theme.space.md;

  const ctx = getLocalContext();
  const deps = getAppDeps();

  // Same rationale as the dashboard's `vm`: the read models below do their
  // own db reads, but keying the memo on `publishedRows` is what makes
  // rating a date or moving its day recompute this screen without a manual
  // refresh, since that's the table `useLiveQuery` is subscribed to.
  const { data: publishedRows } = useLiveQuery(publishedDatesQuery(db, ctx));

  const vm = useMemo(() => {
    const todayLocal = deps.clock.todayLocal();
    const days = publishedRows.map((row) => row.occurredOn);
    return {
      onThisDayDates: onThisDay(db, ctx, todayLocal),
      streak: weekStreak(days, todayLocal),
      milestoneList: milestones(db, ctx),
      favouriteDates: favourites(db, ctx),
    };
  }, [publishedRows, ctx, deps]);

  const { onThisDayDates, streak, milestoneList, favouriteDates } = vm;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: theme.space.md, paddingBottom: listBottomInset, gap: theme.space.md }}
      >
        {/* Rule: a Card holds content, never other Cards. FeedCard is
            already a Card (border, hairline, lift shadow), so a section
            that just lists dates puts its heading bare on the ground —
            same as the feed's MonthHeader — rather than nesting a second
            Card around it. Streak below is the one exception: it holds a
            number and a caption, not another Card, so one level is correct. */}

        {/* On this day: absent entirely when empty, not a permanent empty card
            nobody needs to see until the app is a year old. */}
        {onThisDayDates.length > 0 && (
          <View>
            <MicroLabel>ON THIS DAY</MicroLabel>
            <DateStack dates={onThisDayDates} />
          </View>
        )}

        {/* Streak: always renders — a truthful small number is fine to show. */}
        <Card>
          <MicroLabel>STREAK</MicroLabel>
          <Text style={{ ...theme.type.display, color: t.role.primary, marginTop: theme.space.xs }}>
            {weekWord(streak.current)}
          </Text>
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
            {streak.current === 0
              ? 'Log dates on consecutive weeks to start one'
              : streak.endedLastWeek
                ? 'through last week'
                : 'running'}
          </Text>
          {streak.longest > streak.current && (
            <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
              Longest: {weekWord(streak.longest)}
            </Text>
          )}
        </Card>

        {/* Milestones: only the ones reached — no locked-achievement slots. */}
        {milestoneList.length > 0 && (
          <View>
            <MicroLabel>MILESTONES</MicroLabel>
            {milestoneList.map((milestone) => (
              <MilestoneRow key={milestone.kind} milestone={milestone} />
            ))}
          </View>
        )}

        {/* Favourites: always renders — an invite to rate is the one thing
            here actionable on day one. Empty state is the exception to the
            no-nested-Card rule: with no dates there's nothing to put on the
            ground, and bare floating text is the other thing this user has
            flagged before, so it gets a Card of its own. */}
        <View>
          <MicroLabel>FAVOURITES</MicroLabel>
          {favouriteDates.length === 0 ? (
            <View style={{ marginTop: theme.space.sm }}>
              <Card>
                <Text style={{ ...theme.type.body, color: t.role.inkMuted, textAlign: 'center' }}>
                  Rate a date to see your favourites here.
                </Text>
              </Card>
            </View>
          ) : (
            <DateStack dates={favouriteDates} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
