import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { toFeedDate } from '@/domain/dates/repository';
import { draftDatesQuery, publishedDatesQuery } from '@/domain/dates/drafts';
import { formatMoney, money } from '@/domain/money/money';
import { FeedCard } from '@/render/FeedCard';
import { seedTwelveMonths } from '@/fixtures/seed';
import { getAppDeps, getLocalContext } from '@/session';
import { Card } from '@/ui/Card';
import { MicroLabel } from '@/ui/MicroLabel';
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

  // What is captured but not yet finished into a date. The feed answers "what
  // have I logged that still needs me"; the dashboard owns the budget.
  const queued = useMemo(
    () =>
      drafts.reduce(
        (acc, d) => ({ totalMinor: acc.totalMinor + d.totalMinor, stops: acc.stops + d.stopCount }),
        { totalMinor: 0, stops: 0 },
      ),
    [drafts],
  );

  return (
    <Screen>
      {/*
        A drawer hanging from the top edge: what has been captured but not yet
        finished into a date. Tapping it opens the oldest draft — the
        longest-neglected one is the one worth nudging hardest.

        The budget lives on the Spending tab. This screen answers "what have I
        logged that still needs me", which is a different question.
      */}
      <View style={{ marginHorizontal: -theme.screenMargin, marginBottom: theme.space.md }}>
        <Pressable
          onPress={() => {
            const oldest = drafts[0];
            if (oldest === undefined) return;
            tap();
            router.push(`/date/${oldest.id}/compose`);
          }}
          disabled={drafts.length === 0}
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
            <MicroLabel>NOT SAVED YET</MicroLabel>
            {drafts.length > 0 && (
              <Text style={{ ...theme.type.meta, color: theme.role.primary }}>Finish</Text>
            )}
          </View>

          {drafts.length === 0 ? (
            <Text style={{ ...theme.type.title, color: theme.role.inkMuted, marginTop: theme.space.xs }}>
              Nothing waiting
            </Text>
          ) : (
            <>
              <Text style={{ ...theme.type.display, color: theme.role.primary, marginTop: theme.space.xs }}>
                {formatMoney(money(queued.totalMinor, ctx.currencyCode))}
              </Text>
              <Text style={{ ...theme.type.meta, color: theme.role.inkMuted, marginTop: theme.space.xs }}>
                {queued.stops === 1 ? '1 stop' : `${queued.stops} stops`}
                {' · '}
                {drafts.length === 1 ? '1 date' : `${drafts.length} dates`}
              </Text>
            </>
          )}
        </Pressable>
      </View>

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
