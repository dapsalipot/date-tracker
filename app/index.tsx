import { useMemo } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
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
import { theme } from '@/ui/theme';

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: theme.color.ink }}>Our dates</Text>
        <Text style={{ color: budget.isOverBudget ? theme.color.rose : theme.color.muted, marginTop: 4 }}>
          {remaining}
        </Text>
      </View>

      {drafts.length > 0 && (
        <Pressable
          onPress={() => router.push(`/date/${drafts[0]?.id}/compose`)}
          style={{ marginHorizontal: theme.space.md, marginBottom: theme.space.sm, padding: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush, flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Text style={{ fontWeight: '700', color: theme.color.ink }}>
            {drafts.length === 1 ? '1 date waiting' : `${drafts.length} dates waiting`}
          </Text>
          <Text style={{ color: theme.color.rose, fontWeight: '700' }}>Finish →</Text>
        </Pressable>
      )}

      <FlatList
        data={published}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md, paddingBottom: theme.space.lg }}
        ListEmptyComponent={
          drafts.length === 0 && published.length === 0 ? (
            <Pressable
              onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, deps.clock.todayLocal(), deps)}
              style={{
                padding: theme.space.lg,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.blush,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Seed 12 months of demo dates</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <FeedCard date={item} onPress={() => router.push(`/date/${item.id}`)} />
        )}
      />

      <Pressable
        onPress={() => router.push('/capture')}
        style={{ position: 'absolute', right: theme.space.lg, bottom: theme.space.lg, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: theme.color.cream, fontSize: 30, lineHeight: 34 }}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}
