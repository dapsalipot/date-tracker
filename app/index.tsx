import { useMemo } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, appDeps } from '@/db/client';
import { ensureLocalContext, type LocalContext } from '@/domain/identity/bootstrap';
import { feedDatesQuery, toFeedDate } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { formatMoney, money } from '@/domain/money/money';
import { seedTwelveMonths } from '@/fixtures/seed';
import { theme } from '@/ui/theme';

const FALLBACK_TIMEZONE = 'Asia/Manila';

// Module scope rather than a render-phase useMemo: ensureLocalContext WRITES to
// the database. useMemo initializers may be re-invoked — StrictMode deliberately
// double-invokes them to surface impurity, and the React Compiler (enabled in
// app.json) assumes render is pure. Caching here makes "exactly once per
// process" a property of this code instead of React's memo semantics.
let cachedContext: LocalContext | null = null;

function getLocalContext(): LocalContext {
  cachedContext ??= ensureLocalContext(db, appDeps(FALLBACK_TIMEZONE));
  return cachedContext;
}

export default function Feed() {
  const ctx = getLocalContext();
  const deps = useMemo(() => appDeps(ctx.timezone), [ctx.timezone]);

  // useLiveQuery re-runs whenever the underlying tables change, so no state
  // library and no manual refresh are needed. SQLite is the store.
  const { data } = useLiveQuery(feedDatesQuery(db, ctx.coupleId));
  const dates = useMemo(() => data.map(toFeedDate), [data]);

  // Budget spans two queries, so it cannot be a single live query. Recomputing
  // it when `data` changes is sufficient: every stop write changes `data`.
  const budget = useMemo(
    () => computeBudgetStatus(db, ctx.coupleId, deps),
    [ctx.coupleId, deps, data],
  );

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

      <FlatList
        data={dates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md, paddingBottom: theme.space.lg }}
        ListEmptyComponent={
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
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.color.line,
              padding: theme.space.md,
              marginBottom: theme.space.sm,
            }}
          >
            <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
              {item.occurredOn.toUpperCase()} · {item.status.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: theme.color.ink, marginTop: 2 }}>
              {item.title ?? 'Untitled date'}
            </Text>
            <Text style={{ color: theme.color.muted, marginTop: 4 }}>
              {item.stopCount} stops · {formatMoney(money(item.totalMinor, item.currencyCode))}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
