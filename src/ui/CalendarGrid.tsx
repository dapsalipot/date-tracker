import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DaySpend } from '@/domain/analytics/daily';
import { Card } from '@/ui/Card';
import { isStopKind } from '@/ui/KindIcon';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';
import { tap } from '@/ui/feedback';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The tint's opacity range. Any day with spend gets at least MIN, the
 * month's busiest day gets MAX — a day with no spend gets no tint at all. */
const MIN_ALPHA = 0.18;
const MAX_ALPHA = 0.6;

/** "2026-08" -> "August 2026", off the key's own digits — never a `Date`. */
function monthLabel(periodMonth: string): string {
  const year = periodMonth.slice(0, 4);
  const monthIndex = Number.parseInt(periodMonth.slice(5, 7), 10) - 1;
  return `${MONTH_NAMES[monthIndex] ?? ''} ${year}`.trim();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 30;
}

/**
 * Zeller's congruence on the plain integers, same shape as the one in
 * `FeedCard.tsx` — no `Date` is built, so there is no UTC-midnight parse to
 * shift the day once rendered in a non-UTC timezone. h=0 is Saturday .. h=6
 * is Friday for the Gregorian calendar.
 */
function zellerH(year: number, month: number, day: number): number {
  const isJanOrFeb = month < 3;
  const m = isJanOrFeb ? month + 12 : month;
  const y = isJanOrFeb ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  return (day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
}

/** Sunday-first column index (0=Sun .. 6=Sat) for a given calendar date. */
function weekdayOffset(year: number, month: number, day: number): number {
  return (zellerH(year, month, day) + 6) % 7;
}

/** `#RRGGBB` + an opacity -> `rgba()`. The only colour math here; the hue
 * itself always comes from a `t.role.*` token, never a new hardcoded one. */
function withAlpha(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * One calendar month as a 7-column grid, each week its own row so the
 * division of width is exact per row (a single `100/7 + '%'` basis drifts
 * across rows as the fraction rounds differently each time).
 */
function buildWeeks(periodMonth: string): (string | null)[][] {
  const year = Number.parseInt(periodMonth.slice(0, 4), 10);
  const month = Number.parseInt(periodMonth.slice(5, 7), 10);
  const total = daysInMonth(year, month);
  const offset = weekdayOffset(year, month, 1);

  const cells: (string | null)[] = new Array(offset).fill(null);
  for (let day = 1; day <= total; day++) {
    cells.push(`${periodMonth}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

interface Props {
  /** "YYYY-MM" */
  periodMonth: string;
  /** "YYYY-MM-DD", couple-local. */
  todayLocal: string;
  /** Sparse — only days with spend. The grid draws every cell itself. */
  days: DaySpend[];
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  onStepMonth: (delta: number) => void;
  canStepForward: boolean;
}

/** A month at a glance: heat-tinted by spend, a dot for what the day was
 * mostly about, no amounts — the list below carries that detail. */
export function CalendarGrid({
  periodMonth, todayLocal, days, selectedDay, onSelectDay, onStepMonth, canStepForward,
}: Props) {
  const t = useTheme();
  const weeks = useMemo(() => buildWeeks(periodMonth), [periodMonth]);
  const byDay = useMemo(() => new Map(days.map((d) => [d.occurredOn, d])), [days]);
  const maxSpend = useMemo(() => Math.max(0, ...days.map((d) => d.totalMinor)), [days]);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => { tap(); onStepMonth(-1); }} hitSlop={12}>
          <Text style={{ ...theme.type.title, color: t.role.ink }}>‹</Text>
        </Pressable>
        <Text style={{ ...theme.type.title, color: t.role.ink }}>
          {monthLabel(periodMonth).toUpperCase()}
        </Text>
        <Pressable onPress={() => { tap(); onStepMonth(1); }} disabled={!canStepForward} hitSlop={12}>
          <Text style={{ ...theme.type.title, color: canStepForward ? t.role.ink : t.role.line }}>
            ›
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', marginTop: theme.space.md }}>
        {WEEKDAY_LABELS.map((w) => (
          <View key={w} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ ...theme.type.micro, color: t.role.inkMuted }}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: theme.space.xs }}>
        {weeks.map((week, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {week.map((iso, j) => {
              if (iso === null) return <View key={`blank-${i}-${j}`} style={{ flex: 1, aspectRatio: 1 }} />;

              const spend = byDay.get(iso);
              const dayNum = Number.parseInt(iso.slice(8, 10), 10);
              const isToday = iso === todayLocal;
              const isSelected = iso === selectedDay;
              const tint = spend !== undefined && maxSpend > 0
                ? withAlpha(t.role.primary, MIN_ALPHA + (spend.totalMinor / maxSpend) * (MAX_ALPHA - MIN_ALPHA))
                : 'transparent';
              const dotColor = spend !== undefined
                ? (isStopKind(spend.dominantKind) ? t.kind[spend.dominantKind] : t.kind.other)
                : 'transparent';

              return (
                <Pressable
                  key={iso}
                  onPress={() => { tap(); onSelectDay(iso); }}
                  style={{ flex: 1, aspectRatio: 1, padding: 2 }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: theme.radius.sm,
                      backgroundColor: tint,
                      borderWidth: isSelected ? 1.5 : 0,
                      borderColor: t.role.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                    }}
                  >
                    <View
                      style={
                        isToday
                          ? {
                              minWidth: 20, height: 20, paddingHorizontal: 2, borderRadius: 10,
                              backgroundColor: t.role.primary, alignItems: 'center', justifyContent: 'center',
                            }
                          : { alignItems: 'center', justifyContent: 'center' }
                      }
                    >
                      <Text style={{ ...theme.type.meta, color: isToday ? t.role.onPrimary : t.role.ink }}>
                        {dayNum}
                      </Text>
                    </View>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: dotColor }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Card>
  );
}
