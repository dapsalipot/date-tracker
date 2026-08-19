import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { dailyCovers } from '@/domain/analytics/covers';
import { dailySpend, type DaySpend } from '@/domain/analytics/daily';
import { shiftMonth } from '@/domain/analytics/period';
import { toFeedDate, type FeedDate } from '@/domain/dates/repository';
import { draftDatesQuery, listQueuedStops, publishedDatesQuery, type QueuedStop } from '@/domain/dates/drafts';
import { buildFeedRows, type FeedRow } from '@/domain/dates/rhythm';
import { formatMoney, money } from '@/domain/money/money';
import { attachPhoto } from '@/domain/photos/repository';
import { persistPickedImage } from '@/media/store';
import { FeedCard, FeedHero, kindLabel } from '@/render/FeedCard';
import { seedTwelveMonths } from '@/fixtures/seed';
import { getAppDeps, getLocalContext } from '@/session';
import { CalendarGrid } from '@/ui/CalendarGrid';
import { Card } from '@/ui/Card';
import { KindIcon } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { Rule } from '@/ui/Rule';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';
import { commit, tap } from '@/ui/feedback';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "2026-08" -> "August 2026". Pure string slicing on the ISO key, same as
 * FeedCard's own date formatting — never a `Date`, which would reintroduce
 * the UTC-midnight round-trip this app deliberately avoids.
 */
function monthLabel(monthKey: string): string {
  const year = monthKey.slice(0, 4);
  const monthIndex = Number.parseInt(monthKey.slice(5, 7), 10) - 1;
  return `${MONTH_NAMES[monthIndex] ?? ''} ${year}`.trim();
}

/** "2026-08-18" -> "Aug 18", for the "showing one day" header under the grid. */
function dayLabel(occurredOn: string): string {
  const monthIndex = Number.parseInt(occurredOn.slice(5, 7), 10) - 1;
  const day = Number.parseInt(occurredOn.slice(8, 10), 10);
  return `${MONTH_NAMES[monthIndex]?.slice(0, 3) ?? ''} ${day}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ponytail: 24h-wide buckets off the epoch difference, not a local
// calendar-day compare — "Yesterday" really means "24-48h ago". Fine for a
// capture-time hint; swap for a calendar-aware compare if the imprecision
// near midnight ever matters.
function relativeCaptureTime(nowMs: number, occurredAt: number | null): string {
  if (occurredAt === null) return '';
  const diff = Math.max(0, nowMs - occurredAt);
  if (diff < MINUTE_MS) return 'Just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < DAY_MS * 2) return 'Yesterday';
  return `${Math.floor(diff / DAY_MS)}d ago`;
}

interface MonthSection {
  monthKey: string;
  title: string;
  totalMinor: number;
  data: FeedDate[];
}

const MAX_QUEUED_ROWS = 4;

interface FeedListHeaderProps {
  search: string;
  onChangeSearch: (value: string) => void;
  isSearching: boolean;
  drafts: FeedDate[];
  queuedTotalMinor: number;
  queuedStopCount: number;
  currencyCode: string;
  visibleQueuedStops: QueuedStop[];
  overflowCount: number;
  nowMs: number;
  attachingPhoto: boolean;
  onAttachPhoto: () => void;
  onOpenOldestDraft: () => void;
  periodMonth: string;
  todayLocal: string;
  heatDays: DaySpend[];
  covers: ReadonlyMap<string, string>;
  effectiveSelectedDay: string | null;
  onSelectDay: (day: string) => void;
  onStepMonth: (delta: number) => void;
  onClearSelectedDay: () => void;
  canStepForward: boolean;
}

/**
 * The Dates screen's fixed chrome — search, the queued-spending card, and
 * (outside search) the calendar and its day-selection header — rendered as
 * `ListHeaderComponent` so it scrolls with the feed instead of eating fixed
 * height above it. A single component covers both the FlatList (month view)
 * and SectionList (search view): search hides the calendar/day-header via
 * `isSearching`, exactly as the old inline JSX did.
 *
 * Defined at module scope (not inside `Feed`) so its function identity never
 * changes across renders — `ListHeaderComponent` remounts its subtree
 * whenever the component type it's given changes identity, which would
 * otherwise drop focus from the search `TextInput` on every keystroke.
 */
function FeedListHeader({
  search, onChangeSearch, isSearching, drafts, queuedTotalMinor, queuedStopCount, currencyCode,
  visibleQueuedStops, overflowCount, nowMs, attachingPhoto, onAttachPhoto, onOpenOldestDraft,
  periodMonth, todayLocal, heatDays, covers, effectiveSelectedDay, onSelectDay, onStepMonth,
  onClearSelectedDay, canStepForward,
}: FeedListHeaderProps) {
  const t = useTheme();
  return (
    <>
      <Card padded={false}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.sm,
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
          }}
        >
          <Ionicons name="search-outline" size={18} color={t.role.inkMuted} />
          <TextInput
            value={search}
            onChangeText={onChangeSearch}
            placeholder="Search dates, e.g. aug or 2026-08"
            placeholderTextColor={t.role.inkMuted}
            style={{ ...theme.type.body, color: t.role.ink, flex: 1, padding: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => onChangeSearch('')}>
              <Ionicons name="close-circle" size={18} color={t.role.inkMuted} />
            </Pressable>
          )}
        </View>
      </Card>

      {/*
        What has been captured but not yet finished into a date. Tapping the
        total opens the oldest draft — the longest-neglected one is the one
        worth nudging hardest. The stop list underneath is the point: a total
        alone does not say what was actually logged, or when.
      */}
      <View style={{ marginTop: theme.space.sm }}>
        <Card padded={false}>
          <Pressable
            onPress={onOpenOldestDraft}
            disabled={drafts.length === 0}
            style={{ paddingHorizontal: theme.space.md, paddingTop: theme.space.sm, paddingBottom: theme.space.xs }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <MicroLabel>NOT SAVED YET</MicroLabel>
              {drafts.length > 0 && (
                <Text style={{ ...theme.type.meta, color: t.role.primary }}>Finish</Text>
              )}
            </View>

            {drafts.length === 0 ? (
              <Text style={{ ...theme.type.title, color: t.role.inkMuted, marginTop: theme.space.xs }}>
                Nothing waiting
              </Text>
            ) : (
              <>
                <Text style={{ ...theme.type.display, color: t.role.primary, marginTop: theme.space.xs }}>
                  {formatMoney(money(queuedTotalMinor, currencyCode))}
                </Text>
                <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
                  {queuedStopCount === 1 ? '1 stop' : `${queuedStopCount} stops`}
                  {' · '}
                  {drafts.length === 1 ? '1 date' : `${drafts.length} dates`}
                </Text>
              </>
            )}
          </Pressable>

          {visibleQueuedStops.length > 0 && (
            <View style={{ paddingHorizontal: theme.space.md, paddingBottom: theme.space.sm }}>
              <Rule />
              <View style={{ marginTop: theme.space.sm, gap: theme.space.xs }}>
                {visibleQueuedStops.map((stop) => (
                  <QueuedStopRow key={stop.id} stop={stop} nowMs={nowMs} />
                ))}
                {overflowCount > 0 && (
                  <Text style={{ ...theme.type.micro, color: t.role.inkMuted, marginTop: 2 }}>
                    +{overflowCount} more
                  </Text>
                )}
              </View>
            </View>
          )}

          {drafts.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                paddingHorizontal: theme.space.md,
                paddingBottom: theme.space.md,
              }}
            >
              <Pressable
                onPress={() => { tap(); onAttachPhoto(); }}
                disabled={attachingPhoto}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: theme.radius.lg,
                  backgroundColor: t.role.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: attachingPhoto ? 0.5 : 1,
                }}
              >
                <Ionicons name="camera-outline" size={16} color={t.role.onPrimary} />
              </Pressable>
            </View>
          )}
        </Card>
      </View>

      {/*
        Calendar is the default: it picks the month, the list below just
        shows what's in it. A non-empty search spans months incoherently
        against a single-month grid, so search hides the calendar and falls
        back to the old month-grouped list across every month instead.
      */}
      {!isSearching && (
        <View style={{ marginTop: theme.space.md }}>
          <CalendarGrid
            periodMonth={periodMonth}
            todayLocal={todayLocal}
            days={heatDays}
            covers={covers}
            selectedDay={effectiveSelectedDay}
            onSelectDay={onSelectDay}
            onStepMonth={onStepMonth}
            canStepForward={canStepForward}
          />
        </View>
      )}

      {!isSearching && effectiveSelectedDay !== null && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: theme.space.xs,
            marginTop: theme.space.md,
            borderBottomWidth: 1,
            borderBottomColor: t.role.line,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
            <Ionicons name="calendar-outline" size={14} color={t.role.inkMuted} />
            <MicroLabel>{dayLabel(effectiveSelectedDay).toUpperCase()}</MicroLabel>
          </View>
          <Pressable onPress={onClearSelectedDay} hitSlop={8}>
            <Text style={{ ...theme.type.meta, color: t.role.primary }}>All month</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

/**
 * A standard iOS tab bar is 49pt above the home-indicator inset. `Screen` sets
 * safe-area edges to top/left/right only, deliberately — the tab bar draws over
 * the content — so anything scrollable has to add that room back itself or its
 * last row is clipped by the bar.
 */
const TAB_BAR_HEIGHT = 49;

/** The add button's own footprint: its offset from the bottom plus its size. */
const FAB_CLEARANCE = theme.space.lg + 60;

export default function Feed() {
  const t = useTheme();
  // Room for the tab bar the content scrolls under, plus the floating add
  // button, so the final card is fully readable rather than tucked behind them.
  const insets = useSafeAreaInsets();
  const listBottomInset = TAB_BAR_HEIGHT + insets.bottom + FAB_CLEARANCE + theme.space.md;

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

  // listQueuedStops is a plain read, not a live query of its own — it rides
  // draftRows's reactivity instead of opening a third subscription.
  // draftDatesQuery already joins dates, stops and photos, so anything that
  // would change this list (a new capture, a photo attach) already forces
  // draftRows to a new reference and this memo to recompute.
  const queuedStops = useMemo(() => listQueuedStops(db, ctx), [draftRows, ctx]);
  const visibleQueuedStops = queuedStops.slice(0, MAX_QUEUED_ROWS);
  const overflowCount = queuedStops.length - visibleQueuedStops.length;

  const [search, setSearch] = useState('');
  const [attachingPhoto, setAttachingPhoto] = useState(false);

  const todayLocal = deps.clock.todayLocal();
  const currentMonth = todayLocal.slice(0, 7);
  const [periodMonth, setPeriodMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Guards against a stale pick from a month the stepper has since left —
  // derived rather than reset in an effect, so leaving and returning to a
  // month restores the pick instead of losing it.
  const effectiveSelectedDay = selectedDay !== null && selectedDay.slice(0, 7) === periodMonth ? selectedDay : null;

  const isSearching = search.trim() !== '';

  // Filtering happens here, over the rows the live queries already loaded —
  // no query changes for a search box.
  const filteredPublished = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return published;
    return published.filter((d) => {
      const title = (d.title ?? '').toLowerCase();
      const iso = d.occurredOn.toLowerCase();
      const month = monthLabel(d.occurredOn.slice(0, 7)).toLowerCase();
      return title.includes(q) || iso.includes(q) || month.includes(q);
    });
  }, [published, search]);

  // Grouped in one pass: `published` is already ordered newest-first, so
  // inserting into a Map keyed by month preserves that order for both the
  // sections and each section's own dates — no re-sort needed. Only used
  // while searching: a query can span months, so results still need a month
  // header to place them. The calendar already supplies that context for the
  // single-month view below.
  const searchSections = useMemo(() => {
    const byMonth = new Map<string, MonthSection>();
    for (const date of filteredPublished) {
      const monthKey = date.occurredOn.slice(0, 7);
      let section = byMonth.get(monthKey);
      if (section === undefined) {
        section = { monthKey, title: monthLabel(monthKey), totalMinor: 0, data: [] };
        byMonth.set(monthKey, section);
      }
      section.totalMinor += date.totalMinor;
      section.data.push(date);
    }
    return Array.from(byMonth.values());
  }, [filteredPublished]);

  // Each section's dates pre-chunked into hero/pair rows so `SectionList`
  // can still virtualise the hero+grid layout — one `renderItem` per row
  // instead of mounting every card (and every cover photo) at once.
  const searchRowSections = useMemo(
    () => searchSections.map((section) => ({ ...section, data: buildFeedRows(section.data) })),
    [searchSections],
  );

  // The single month the calendar is showing — what the list below renders
  // when there's no active search. `published` is already newest-first.
  const monthDates = useMemo(
    () => published.filter((d) => d.occurredOn.slice(0, 7) === periodMonth),
    [published, periodMonth],
  );
  const displayedMonthDates = useMemo(
    () => (effectiveSelectedDay === null ? monthDates : monthDates.filter((d) => d.occurredOn === effectiveSelectedDay)),
    [monthDates, effectiveSelectedDay],
  );
  const monthRows = useMemo(() => buildFeedRows(displayedMonthDates), [displayedMonthDates]);

  // dailySpend is a plain read, not a live query of its own — like the
  // dashboard's other domain reads, it rides draftRows/publishedRows's
  // reactivity so a fresh capture recolours the grid without a new subscription.
  const heatDays = useMemo(
    () => dailySpend(db, ctx, periodMonth),
    [periodMonth, ctx, draftRows, publishedRows],
  );

  // Same rationale as heatDays: a plain read riding the live queries'
  // reactivity, converted once to a by-day map since the grid wants lookup
  // by day and dailyCovers returns an array.
  const covers = useMemo(
    () => new Map(dailyCovers(db, ctx, periodMonth).map((c) => [c.occurredOn, c.coverUri])),
    [periodMonth, ctx, draftRows, publishedRows],
  );

  const attachPhotoToLatestQueued = async () => {
    if (attachingPhoto) return;
    const latest = queuedStops[0];
    if (latest === undefined) return;

    setAttachingPhoto(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera unavailable', 'You can attach a receipt photo later.');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      const asset = shot.assets?.[0];
      if (shot.canceled || !asset) return;

      // Copy to durable storage before the database write: the picker's uri
      // is a temporary cache entry the OS can reclaim, and a row pointing at
      // a reclaimed file is a permanently broken image with no way to notice.
      const durable = persistPickedImage(asset.uri, `${deps.newId()}.jpg`);
      attachPhoto(db, deps, {
        dateId: latest.dateId,
        stopId: latest.id,
        localUri: durable,
        width: asset.width,
        height: asset.height,
      });
      commit();
    } catch {
      Alert.alert('Could not attach that photo', 'Something went wrong saving it to your device.');
    } finally {
      setAttachingPhoto(false);
    }
  };

  // Stable-typed element (not a fresh inline component) so `ListHeaderComponent`
  // never remounts it across renders — see `FeedListHeader`'s own doc comment.
  // Shared by both lists below: search hides the calendar/day-header, exactly
  // as the header's own `isSearching` branch already handles.
  const listHeader = (
    <FeedListHeader
      search={search}
      onChangeSearch={setSearch}
      isSearching={isSearching}
      drafts={drafts}
      queuedTotalMinor={queued.totalMinor}
      queuedStopCount={queued.stops}
      currencyCode={ctx.currencyCode}
      visibleQueuedStops={visibleQueuedStops}
      overflowCount={overflowCount}
      nowMs={deps.clock.nowMs()}
      attachingPhoto={attachingPhoto}
      onAttachPhoto={() => void attachPhotoToLatestQueued()}
      onOpenOldestDraft={() => {
        const oldest = drafts[0];
        if (oldest === undefined) return;
        tap();
        router.push(`/date/${oldest.id}/compose`);
      }}
      periodMonth={periodMonth}
      todayLocal={todayLocal}
      heatDays={heatDays}
      covers={covers}
      effectiveSelectedDay={effectiveSelectedDay}
      onSelectDay={(day) => setSelectedDay((cur) => (cur === day ? null : day))}
      onStepMonth={(delta) => setPeriodMonth((p) => shiftMonth(p, delta))}
      onClearSelectedDay={() => setSelectedDay(null)}
      canStepForward={periodMonth !== currentMonth}
    />
  );

  return (
    <Screen>
      {isSearching ? (
        <SectionList
          style={{ flex: 1 }}
          sections={searchRowSections}
          keyExtractor={feedRowKey}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: listBottomInset, gap: theme.space.md }}
          renderSectionHeader={({ section }) => <MonthHeader section={section} currencyCode={ctx.currencyCode} />}
          renderItem={({ item }) => (
            <FeedRhythmRow row={item} onPress={(date) => router.push(`/date/${date.id}`)} />
          )}
          ListEmptyComponent={
            <Card>
              <Text style={{ ...theme.type.body, color: t.role.inkMuted, textAlign: 'center' }}>
                No dates match "{search.trim()}"
              </Text>
            </Card>
          }
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={monthRows}
          keyExtractor={feedRowKey}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingBottom: listBottomInset, gap: theme.space.md }}
          renderItem={({ item }) => (
            <FeedRhythmRow row={item} onPress={(date) => router.push(`/date/${date.id}`)} />
          )}
          ListEmptyComponent={
            drafts.length === 0 && published.length === 0 ? (
              <Card onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, todayLocal, deps)}>
                <Text style={{ ...theme.type.body, fontFamily: theme.type.meta.fontFamily, color: t.role.ink, textAlign: 'center' }}>
                  Seed 12 months of demo dates
                </Text>
              </Card>
            ) : (
              <Card>
                <Text style={{ ...theme.type.body, color: t.role.inkMuted, textAlign: 'center' }}>
                  {effectiveSelectedDay !== null ? 'Nothing logged this day' : 'Nothing logged this month'}
                </Text>
              </Card>
            )
          }
        />
      )}

      <Pressable
        onPress={() => { tap(); router.push('/capture'); }}
        style={{
          position: 'absolute',
          right: theme.space.lg,
          bottom: theme.space.lg,
          width: 60,
          height: 60,
          borderRadius: theme.radius.lg,
          backgroundColor: t.role.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={30} color={t.role.onPrimary} />
      </Pressable>
    </Screen>
  );
}

/** One queued stop: its kind, what it was, what it cost, and when it landed. */
function QueuedStopRow({ stop, nowMs }: { stop: QueuedStop; nowMs: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
      <KindIcon kind={stop.kind} size={14} />
      <Text numberOfLines={1} style={{ ...theme.type.meta, color: t.role.ink, flex: 1 }}>
        {stop.label ?? kindLabel(stop.kind)}
      </Text>
      <Text style={{ ...theme.type.meta, color: t.role.inkMuted }}>
        {formatMoney(money(stop.amountMinor, stop.currencyCode))}
      </Text>
      <Text style={{ ...theme.type.micro, color: t.role.inkMuted, minWidth: 52, textAlign: 'right' }}>
        {relativeCaptureTime(nowMs, stop.occurredAt)}
      </Text>
    </View>
  );
}

/**
 * A month section header. It sits directly on the ground rather than inside
 * a `Card`, so its own treatment — the icon, the letterspaced label, the
 * hairline underneath — is what keeps it from reading as bare floating text.
 */
function MonthHeader({ section, currencyCode }: { section: { title: string; totalMinor: number }; currencyCode: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: theme.space.xs,
        borderBottomWidth: 1,
        borderBottomColor: t.role.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
        <Ionicons name="calendar-outline" size={14} color={t.role.inkMuted} />
        <MicroLabel>{section.title.toUpperCase()}</MicroLabel>
      </View>
      <Text style={{ ...theme.type.body, color: t.role.ink, fontFamily: theme.type.meta.fontFamily }}>
        {formatMoney(money(section.totalMinor, currencyCode))}
      </Text>
    </View>
  );
}

/** Stable key for a `FeedRow` — a pair row has no single id of its own. */
function feedRowKey(row: FeedRow): string {
  return row.type === 'hero' ? `hero-${row.date.id}` : `pair-${row.dates.map((d) => d.id).join('-')}`;
}

/**
 * Renders one row of `buildFeedRows`'s output: the hero full-bleed, or a
 * pair side by side. This is the `renderItem` that lets `FlatList`/
 * `SectionList` virtualise the hero+grid rhythm — each row mounts only when
 * it scrolls into view, same as the plain single-column list did before.
 */
function FeedRhythmRow({ row, onPress }: { row: FeedRow; onPress: (date: FeedDate) => void }) {
  if (row.type === 'hero') {
    return <FeedHero date={row.date} onPress={() => onPress(row.date)} />;
  }

  const [first, second] = row.dates;
  if (first === undefined) return null; // buildFeedRows never emits an empty pair
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.md }}>
      <View style={{ flex: 1 }}>
        <FeedCard date={first} onPress={() => onPress(first)} />
      </View>
      {/* An empty spacer keeps a trailing odd card at half width instead of
          stretching to fill the row. */}
      <View style={{ flex: 1 }}>
        {second !== undefined && <FeedCard date={second} onPress={() => onPress(second)} />}
      </View>
    </View>
  );
}
