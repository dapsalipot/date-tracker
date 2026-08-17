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
import { MicroLabel } from '@/ui/MicroLabel';
import { Rule } from '@/ui/Rule';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
import { tap } from '@/ui/feedback';

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

  const remaining =
    budget.remainingMinor === null
      ? 'No budget set'
      : `${formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left · ${budget.daysLeft}d`;

  return (
    <Screen>
      <View style={{ paddingTop: theme.space.sm }}>
        <MicroLabel>OUR DATES</MicroLabel>
        <Text
          style={{
            ...theme.type.meta,
            color: budget.isOverBudget ? theme.role.accent : theme.role.inkMuted,
            marginTop: theme.space.xs,
          }}
        >
          {remaining}
        </Text>
      </View>

      {drafts.length > 0 && (
        <View style={{ marginTop: theme.space.md }}>
          <Rule />
          <Pressable
            onPress={() => router.push(`/date/${drafts[0]?.id}/compose`)}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: theme.space.sm,
            }}
          >
            <MicroLabel>
              {drafts.length === 1 ? '1 DATE WAITING' : `${drafts.length} DATES WAITING`}
            </MicroLabel>
            <Text style={{ ...theme.type.meta, color: theme.role.accent }}>Finish</Text>
          </Pressable>
          <Rule />
        </View>
      )}

      {/*
        The Screen body carries paddingHorizontal: theme.screenMargin, which
        would otherwise inset the FlatList and cap FeedCard's photo short of
        the true edge. Cancelling it here with an equal negative margin lets
        the list reach the screen edges again; FeedCard's own text block then
        reapplies theme.screenMargin so its type lines up with the header
        above, while its image has no such padding and bleeds full width.
      */}
      <FlatList
        data={published}
        keyExtractor={(item) => item.id}
        style={{ marginHorizontal: -theme.screenMargin }}
        contentContainerStyle={{ paddingBottom: theme.space.xxl }}
        ItemSeparatorComponent={Rule}
        ListEmptyComponent={
          drafts.length === 0 && published.length === 0 ? (
            <Pressable
              onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, deps.clock.todayLocal(), deps)}
              style={{
                marginHorizontal: theme.screenMargin,
                marginTop: theme.space.lg,
                padding: theme.space.lg,
                borderRadius: theme.radius.md,
                backgroundColor: theme.role.accentQuiet,
                alignItems: 'center',
              }}
            >
              <Text style={{ ...theme.type.body, fontWeight: '600', color: theme.role.ink }}>
                Seed 12 months of demo dates
              </Text>
            </Pressable>
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
          backgroundColor: theme.role.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ ...theme.type.display, color: theme.role.ground }}>+</Text>
      </Pressable>
    </Screen>
  );
}
