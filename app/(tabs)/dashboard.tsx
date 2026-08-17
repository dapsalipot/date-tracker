import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { publishedDatesQuery } from '@/domain/dates/drafts';
import { shiftMonth } from '@/domain/analytics/period';
import { budgetStatusFor } from '@/domain/budget/status';
import { spendByKind, spendBySubkind } from '@/domain/analytics/spend';
import { monthlyTrend, perDateAverage } from '@/domain/analytics/trend';
import { topPlaces } from '@/domain/analytics/places';
import { formatMoney, money } from '@/domain/money/money';
import { Bar } from '@/ui/Bar';
import { theme } from '@/ui/theme';

const TREND_MONTHS = 12;
const TREND_CHART_HEIGHT = 80;
/** A zero-spend month still gets a visible sliver — the gap is the point. */
const TREND_MIN_SLIVER = 3;
const TOP_PLACES_LIMIT = 5;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-08" -> "August 2026". Built from the key itself, not `Date`, for the
 * same reason `shiftMonth` avoids it: no timezone to shift the answer. */
function formatPeriodMonth(periodMonth: string): string {
  const [year = '', month = ''] = periodMonth.split('-');
  const name = MONTH_NAMES[Number.parseInt(month, 10) - 1] ?? month;
  return `${name} ${year}`;
}

const sectionHeader = { fontSize: 11, letterSpacing: 1, color: theme.color.muted } as const;
const muted = { color: theme.color.muted } as const;

export default function Dashboard() {
  const ctx = getLocalContext();
  const deps = getAppDeps();
  const currentMonth = deps.clock.todayLocal().slice(0, 7);

  const [periodMonth, setPeriodMonth] = useState(currentMonth);
  const [drilledKind, setDrilledKind] = useState<string | null>(null);

  const step = (delta: number) => {
    setPeriodMonth((p) => shiftMonth(p, delta));
    // A kind drilled into in one month may not exist in the next — reset
    // rather than show a stale drill-down for the new month.
    setDrilledKind(null);
  };

  // Plain reads, not live queries — subscribing to the published-dates table
  // is what makes a capture made while this screen is mounted show up.
  const { data: publishedRows } = useLiveQuery(publishedDatesQuery(db, ctx), [ctx]);

  const vm = useMemo(() => {
    const todayLocal = deps.clock.todayLocal();
    return {
      budget: budgetStatusFor(db, ctx, periodMonth, todayLocal),
      kindSlices: spendByKind(db, ctx, periodMonth),
      subkindSlices: drilledKind ? spendBySubkind(db, ctx, periodMonth, drilledKind) : [],
      trend: monthlyTrend(db, ctx, periodMonth, TREND_MONTHS),
      average: perDateAverage(db, ctx, periodMonth, TREND_MONTHS),
      places: topPlaces(db, ctx, periodMonth, TOP_PLACES_LIMIT, TREND_MONTHS),
    };
  }, [periodMonth, drilledKind, ctx, deps, publishedRows]);

  const { budget, kindSlices, subkindSlices, trend, average, places } = vm;
  const budgetMinor = budget.budgetMinor;
  const topKindTotal = kindSlices[0]?.totalMinor ?? 1;
  const topSubkindTotal = subkindSlices[0]?.totalMinor ?? 1;
  const topTrendTotal = Math.max(...trend.map((m) => m.totalMinor), 1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md, gap: theme.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => step(-1)} hitSlop={12}>
            <Text style={{ fontSize: 24, color: theme.color.ink }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: '800', color: theme.color.ink }}>
            {formatPeriodMonth(periodMonth)}
          </Text>
          <Pressable onPress={() => step(1)} disabled={periodMonth === currentMonth} hitSlop={12}>
            <Text style={{ fontSize: 24, color: periodMonth === currentMonth ? theme.color.line : theme.color.ink }}>
              ›
            </Text>
          </Pressable>
        </View>

        {/* Section 1 — this month */}
        <View style={{ gap: theme.space.sm }}>
          <Text style={sectionHeader}>THIS MONTH</Text>
          {budgetMinor === null ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.color.ink }}>
                {formatMoney(money(budget.spentMinor, ctx.currencyCode))} spent
              </Text>
              <Text style={muted}>No budget set</Text>
            </>
          ) : (
            <>
              <Bar
                label="Spent"
                value={`${formatMoney(money(budget.spentMinor, ctx.currencyCode))} of ${formatMoney(money(budgetMinor, ctx.currencyCode))}`}
                fraction={budget.spentMinor / budgetMinor}
                tint={budget.isOverBudget ? theme.color.rose : theme.color.gold}
              />
              {budget.remainingMinor !== null && budget.daysLeft > 0 && (
                <Text style={muted}>
                  {formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left · {budget.daysLeft}d
                </Text>
              )}
            </>
          )}
        </View>

        {/* Section 2 — where it went */}
        <View style={{ gap: theme.space.sm }}>
          {drilledKind ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={sectionHeader}>{drilledKind.toUpperCase()}</Text>
              <Pressable onPress={() => setDrilledKind(null)}>
                <Text style={{ color: theme.color.rose, fontWeight: '700' }}>‹ All kinds</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={sectionHeader}>WHERE IT WENT</Text>
          )}

          {kindSlices.length === 0 ? (
            <Text style={muted}>Nothing logged this month</Text>
          ) : drilledKind ? (
            <View style={{ gap: theme.space.sm }}>
              {subkindSlices.map((slice) => (
                <Bar
                  key={slice.key}
                  label={slice.key.toUpperCase()}
                  value={formatMoney(money(slice.totalMinor, ctx.currencyCode))}
                  fraction={slice.totalMinor / topSubkindTotal}
                />
              ))}
            </View>
          ) : (
            <View style={{ gap: theme.space.sm }}>
              {kindSlices.map((slice) => (
                <Bar
                  key={slice.key}
                  label={slice.key.toUpperCase()}
                  value={formatMoney(money(slice.totalMinor, ctx.currencyCode))}
                  fraction={slice.totalMinor / topKindTotal}
                  onPress={() => setDrilledKind(slice.key)}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {/*
        flex: 1 is load-bearing. React Native defaults flexShrink to 0, so a
        ScrollView with no flex is sized by its content: once the fixed block
        above plus this content exceed the viewport, its frame runs past the
        screen edge, gets clipped, and has nothing left to scroll — sections 4
        and 5 become unreachable on a smaller phone or at large text sizes.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.space.md, paddingTop: 0, gap: theme.space.lg }}
      >
        {/* Section 3 — trend */}
        <View style={{ gap: theme.space.sm }}>
          <Text style={sectionHeader}>TREND</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: TREND_CHART_HEIGHT, gap: theme.space.xs }}>
            {trend.map((m) => (
              <View key={m.periodMonth} style={{ flex: 1, alignItems: 'center' }}>
                <View
                  style={{
                    width: '100%',
                    height: Math.max((m.totalMinor / topTrendTotal) * TREND_CHART_HEIGHT, TREND_MIN_SLIVER),
                    borderRadius: 3,
                    backgroundColor: m.periodMonth === periodMonth ? theme.color.rose : theme.color.blush,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {/* Twelve rotated labels are unreadable on a phone — only the ends are labelled. */}
            <Text style={muted}>{trend[0] ? formatPeriodMonth(trend[0].periodMonth) : ''}</Text>
            <Text style={muted}>
              {trend.length > 0 ? formatPeriodMonth(trend[trend.length - 1]!.periodMonth) : ''}
            </Text>
          </View>
        </View>

        {/* Section 4 — per-date average */}
        <View style={{ gap: theme.space.sm }}>
          <Text style={sectionHeader}>PER-DATE AVERAGE</Text>
          {average.monthMinor === null ? (
            <Text style={muted}>No dates this month</Text>
          ) : (
            <>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.color.ink }}>
                {formatMoney(money(average.monthMinor, ctx.currencyCode))} this month
              </Text>
              {average.trailingMinor !== null && (
                <Text style={muted}>
                  {formatMoney(money(average.trailingMinor, ctx.currencyCode))} trailing {TREND_MONTHS}mo ·{' '}
                  {average.monthMinor > average.trailingMinor
                    ? '↑ up'
                    : average.monthMinor < average.trailingMinor
                      ? '↓ down'
                      : '→ flat'}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Section 5 — most expensive places */}
        <View style={{ gap: theme.space.sm }}>
          <Text style={sectionHeader}>MOST EXPENSIVE PLACES</Text>
          {places.length === 0 ? (
            <Text style={muted}>Place names are optional, set in the composer — log a few and they’ll show up here.</Text>
          ) : (
            <View style={{ gap: theme.space.xs }}>
              {places.map((place) => (
                <View key={place.placeName} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.color.ink }}>{place.placeName}</Text>
                  <Text style={muted}>{formatMoney(money(place.totalMinor, ctx.currencyCode))}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
