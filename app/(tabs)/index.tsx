import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { toFeedDate } from '@/domain/dates/repository';
import { draftDatesQuery, publishedDatesQuery } from '@/domain/dates/drafts';
import { computeBudgetStatus } from '@/domain/budget/status';
import { formatMoney, money } from '@/domain/money/money';
import { FeedCard } from '@/render/FeedCard';
import { seedTwelveMonths } from '@/fixtures/seed';
import { getAppDeps, getLocalContext } from '@/session';
import { Card } from '@/ui/Card';
import { MicroLabel } from '@/ui/MicroLabel';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
import { tap } from '@/ui/feedback';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/** "2026-08" -> "AUGUST 2026". Same slice-not-Date approach as FeedCard. */
function monthLabel(periodMonth: string): string {
  const monthIndex = Number.parseInt(periodMonth.slice(5, 7), 10) - 1;
  return `${MONTHS[monthIndex] ?? ''} ${periodMonth.slice(0, 4)}`;
}

export default function Feed() {
  const ctx = getLocalContext();
  const deps = getAppDeps();

  // useLiveQuery re-runs whenever the underlying tables change, so no state
  // library and no manual refresh are needed. SQLite is the store. Two live
  // queries rather than one filtered in JS: drafts and published dates render
  // as different UI (a slim strip vs. cards) and sort in opposite directions.
  const { data: draftRows } = useLiveQuery(draftDatesQuery(db, ctx));
  const { data: publishedRows } = useLiveQuery(publishedDatesQuery(db, ctx));
  const drafts = useMemo(() => draftRows.map((r) => toFeedDate(r, ctx.currencyCode)), [draftRows, ctx.currencyCode]);
  const published = useMemo(
    () => publishedRows.map((r) => toFeedDate(r, ctx.currencyCode)),
    [publishedRows, ctx.currencyCode],
  );

  // Budget spans two queries, so it cannot be a single live query. Recomputing
  // it when either list changes is sufficient: every stop write changes one.
  const budget = useMemo(() => computeBudgetStatus(db, ctx, deps), [ctx, deps, draftRows, publishedRows]);

  // The headline is the number alone; "left to spend" and the day count are
  // separate, smaller lines. Cramming them into one display-size string made
  // the whole header read as one shouted sentence.
  const headlineAmount =
    budget.remainingMinor === null
      ? 'No budget set'
      : formatMoney(money(budget.remainingMinor, ctx.currencyCode));

  const spentFraction =
    budget.budgetMinor === null || budget.budgetMinor === 0
      ? 0
      : Math.max(0, Math.min(1, budget.spentMinor / budget.budgetMinor));

  return (
    <Screen>
      {/*
        A drawer that hangs from the top of the screen: square top corners so it
        reads as attached to the edge, rounded bottom so it reads as a card.
        Nothing sits loose on the ground — a number floating on the background
        looks like debug output, not a header.
      */}
      <View style={{ marginHorizontal: -theme.screenMargin, marginBottom: theme.space.md }}>
        <View
          style={{
            backgroundColor: theme.role.surface,
            borderBottomLeftRadius: theme.radius.lg,
            borderBottomRightRadius: theme.radius.lg,
            paddingHorizontal: theme.screenMargin,
            paddingTop: theme.space.sm,
            paddingBottom: theme.space.md,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <MicroLabel>{monthLabel(budget.periodMonth)}</MicroLabel>
            {budget.budgetMinor !== null && (
              <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>
                {budget.daysLeft}d left
              </Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm, marginTop: theme.space.xs }}>
            <Text style={{ ...theme.type.display, color: theme.role.primary }}>{headlineAmount}</Text>
            {budget.budgetMinor !== null && (
              <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>left to spend</Text>
            )}
          </View>

          {budget.budgetMinor !== null && (
            <View
              style={{
                height: 6,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.role.line,
                marginTop: theme.space.sm,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${spentFraction * 100}%`,
                  height: '100%',
                  backgroundColor: budget.isOverBudget ? theme.role.primary : theme.role.ink,
                }}
              />
            </View>
          )}
        </View>
      </View>

      {drafts.length > 0 && (
        <View style={{ marginTop: theme.space.md, marginBottom: theme.space.md }}>
          <Card onPress={() => router.push(`/date/${drafts[0]?.id}/compose`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <MicroLabel>
                {drafts.length === 1 ? '1 DATE WAITING' : `${drafts.length} DATES WAITING`}
              </MicroLabel>
              <Text style={{ ...theme.type.meta, color: theme.role.primary }}>Finish</Text>
            </View>
          </Card>
        </View>
      )}

      <FlatList
        data={published}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: theme.space.md, paddingBottom: theme.space.xxl, gap: theme.space.md }}
        ListEmptyComponent={
          drafts.length === 0 && published.length === 0 ? (
            <Card onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, deps.clock.todayLocal(), deps)}>
              <Text style={{ ...theme.type.body, fontWeight: '600', color: theme.role.ink, textAlign: 'center' }}>
                Seed 12 months of demo dates
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <FeedCard date={item} onPress={() => router.push(`/date/${item.id}`)} />
        )}
      />

      <Pressable
        onPress={() => { tap(); router.push('/capture'); }}
        style={{
          position: 'absolute',
          right: theme.space.lg,
          bottom: theme.space.lg,
          width: 60,
          height: 60,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.role.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ ...theme.type.display, color: theme.role.onPrimary }}>+</Text>
      </Pressable>
    </Screen>
  );
}
