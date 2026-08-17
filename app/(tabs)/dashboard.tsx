import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import { Card } from '@/ui/Card';
import { isStopKind } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { Screen } from '@/ui/Screen';
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

const muted = { ...theme.type.meta, color: theme.role.inkMuted } as const;

/** Bars are the one place a kind colour fills rather than outlines. */
function kindTint(kind: string): string {
  return isStopKind(kind) ? theme.kind[kind] : theme.kind.other;
}

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
    <Screen>
      {/*
        The month stepper is a drawer hanging from the top edge, matching the
        feed's budget header. Nothing on this screen sits loose on the ground —
        every section below is a Card.
      */}
      <View style={{ marginHorizontal: -theme.screenMargin }}>
        <View
          style={{
            backgroundColor: theme.role.surface,
            borderBottomLeftRadius: theme.radius.lg,
            borderBottomRightRadius: theme.radius.lg,
            paddingHorizontal: theme.screenMargin,
            paddingVertical: theme.space.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable onPress={() => step(-1)} hitSlop={12}>
            <Text style={{ ...theme.type.title, color: theme.role.ink }}>‹</Text>
          </Pressable>
          <Text style={{ ...theme.type.title, color: theme.role.ink }}>
            {formatPeriodMonth(periodMonth)}
          </Text>
          <Pressable onPress={() => step(1)} disabled={periodMonth === currentMonth} hitSlop={12}>
            <Text
              style={{
                ...theme.type.title,
                color: periodMonth === currentMonth ? theme.role.line : theme.role.ink,
              }}
            >
              ›
            </Text>
          </Pressable>
        </View>
      </View>

      {/*
        flex: 1 is load-bearing. React Native defaults flexShrink to 0, so a
        ScrollView with no flex is sized by its content, runs past the screen
        edge, and has nothing left to scroll.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: theme.space.md, paddingBottom: theme.space.xxl, gap: theme.space.md }}
      >
        <Card>
          <MicroLabel>THIS MONTH</MicroLabel>
          {budgetMinor === null ? (
            <>
              <Text style={{ ...theme.type.display, color: theme.role.primary, marginTop: theme.space.xs }}>
                {formatMoney(money(budget.spentMinor, ctx.currencyCode))}
              </Text>
              <Text style={muted}>spent · no budget set</Text>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.sm, marginTop: theme.space.xs }}>
                <Text style={{ ...theme.type.display, color: theme.role.primary }}>
                  {formatMoney(money(budget.spentMinor, ctx.currencyCode))}
                </Text>
                <Text style={muted}>of {formatMoney(money(budgetMinor, ctx.currencyCode))}</Text>
              </View>
              {/* Segmented by kind: the breakdown and the headline are one object. */}
              <View
                style={{
                  height: 8,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.role.line,
                  marginTop: theme.space.sm,
                  overflow: 'hidden',
                  flexDirection: 'row',
                }}
              >
                {kindSlices.map((slice) => (
                  <View
                    key={slice.key}
                    style={{
                      width: `${Math.max(0, Math.min(1, slice.totalMinor / budgetMinor)) * 100}%`,
                      height: '100%',
                      backgroundColor: kindTint(slice.key),
                    }}
                  />
                ))}
              </View>
              {budget.remainingMinor !== null && (
                <Text style={{ ...muted, marginTop: theme.space.sm }}>
                  {formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left
                  {budget.daysLeft > 0 ? ` · ${budget.daysLeft}d` : ''}
                </Text>
              )}
            </>
          )}
        </Card>

        <Card>
          {drilledKind ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <MicroLabel>{drilledKind.toUpperCase()}</MicroLabel>
              <Pressable onPress={() => setDrilledKind(null)} hitSlop={8}>
                <Text style={{ ...theme.type.meta, color: theme.role.primary }}>‹ All kinds</Text>
              </Pressable>
            </View>
          ) : (
            <MicroLabel>WHERE IT WENT</MicroLabel>
          )}

          <View style={{ gap: theme.space.sm, marginTop: theme.space.sm }}>
            {kindSlices.length === 0 ? (
              <Text style={muted}>Nothing logged this month</Text>
            ) : drilledKind ? (
              subkindSlices.map((slice) => (
                <Bar
                  key={slice.key}
                  label={slice.key}
                  value={formatMoney(money(slice.totalMinor, ctx.currencyCode))}
                  fraction={slice.totalMinor / topSubkindTotal}
                  tint={kindTint(drilledKind)}
                />
              ))
            ) : (
              kindSlices.map((slice) => (
                <Bar
                  key={slice.key}
                  label={slice.key}
                  value={formatMoney(money(slice.totalMinor, ctx.currencyCode))}
                  fraction={slice.totalMinor / topKindTotal}
                  tint={kindTint(slice.key)}
                  onPress={() => setDrilledKind(slice.key)}
                />
              ))
            )}
          </View>
        </Card>

        <Card>
          <MicroLabel>TREND</MicroLabel>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              height: TREND_CHART_HEIGHT,
              gap: 2,
              marginTop: theme.space.sm,
            }}
          >
            {trend.map((m) => (
              <View
                key={m.periodMonth}
                style={{
                  flex: 1,
                  height: Math.max((m.totalMinor / topTrendTotal) * TREND_CHART_HEIGHT, TREND_MIN_SLIVER),
                  borderRadius: 2,
                  backgroundColor: m.periodMonth === periodMonth ? theme.role.primary : theme.role.line,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.space.xs }}>
            {/* Twelve rotated labels are unreadable on a phone — only the ends. */}
            <Text style={muted}>{trend[0] ? formatPeriodMonth(trend[0].periodMonth) : ''}</Text>
            <Text style={muted}>
              {trend.length > 0 ? formatPeriodMonth(trend[trend.length - 1]!.periodMonth) : ''}
            </Text>
          </View>
        </Card>

        <Card>
          <MicroLabel>PER-DATE AVERAGE</MicroLabel>
          {average.monthMinor === null ? (
            <Text style={{ ...muted, marginTop: theme.space.xs }}>No dates this month</Text>
          ) : (
            <>
              <Text style={{ ...theme.type.display, color: theme.role.ink, marginTop: theme.space.xs }}>
                {formatMoney(money(average.monthMinor, ctx.currencyCode))}
              </Text>
              {average.trailingMinor !== null && (
                <Text style={muted}>
                  {average.monthMinor > average.trailingMinor
                    ? '↑ above'
                    : average.monthMinor < average.trailingMinor
                      ? '↓ below'
                      : '→ level with'}{' '}
                  the {formatMoney(money(average.trailingMinor, ctx.currencyCode))} usual
                </Text>
              )}
            </>
          )}
        </Card>

        <Card>
          <MicroLabel>MOST EXPENSIVE PLACES</MicroLabel>
          <View style={{ gap: theme.space.sm, marginTop: theme.space.sm }}>
            {places.length === 0 ? (
              <Text style={muted}>
                Place names are optional, set in the composer — log a few and they’ll show up here.
              </Text>
            ) : (
              places.map((place) => (
                <View
                  key={place.placeName}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
                >
                  <Text style={{ ...theme.type.body, color: theme.role.ink }}>{place.placeName}</Text>
                  <Text style={muted}>{formatMoney(money(place.totalMinor, ctx.currencyCode))}</Text>
                </View>
              ))
            )}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
