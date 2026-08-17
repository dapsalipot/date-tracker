import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { publishedDatesQuery } from '@/domain/dates/drafts';
import { shiftMonth } from '@/domain/analytics/period';
import { budgetStatusFor } from '@/domain/budget/status';
import { spendByKind, spendBySubkind } from '@/domain/analytics/spend';
import { formatMoney, money } from '@/domain/money/money';
import { Bar } from '@/ui/Bar';
import { theme } from '@/ui/theme';

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
    };
  }, [periodMonth, drilledKind, ctx, deps, publishedRows]);

  const { budget, kindSlices, subkindSlices } = vm;
  const budgetMinor = budget.budgetMinor;
  const topKindTotal = kindSlices[0]?.totalMinor ?? 1;
  const topSubkindTotal = subkindSlices[0]?.totalMinor ?? 1;

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
    </SafeAreaView>
  );
}
