import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { dailySpend } from '@/domain/analytics/daily';
import { shiftMonth } from '@/domain/analytics/period';
import { toFeedDate, type FeedDate } from '@/domain/dates/repository';
import { draftDatesQuery, listQueuedStops, publishedDatesQuery, type QueuedStop } from '@/domain/dates/drafts';
import { formatMoney, money } from '@/domain/money/money';
import { attachPhoto } from '@/domain/photos/repository';
import { persistPickedImage } from '@/media/store';
import { FeedCard, kindLabel } from '@/render/FeedCard';
import { seedTwelveMonths } from '@/fixtures/seed';
import { getAppDeps, getLocalContext } from '@/session';
import { CalendarGrid } from '@/ui/CalendarGrid';
import { Card } from '@/ui/Card';
import { KindIcon } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { Rule } from '@/ui/Rule';
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

export default function Feed() {
  const t = useTheme();
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

  // dailySpend is a plain read, not a live query of its own — like the
  // dashboard's other domain reads, it rides draftRows/publishedRows's
  // reactivity so a fresh capture recolours the grid without a new subscription.
  const heatDays = useMemo(
    () => dailySpend(db, ctx, periodMonth),
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

  return (
    <Screen>
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
            onChangeText={setSearch}
            placeholder="Search dates, e.g. aug or 2026-08"
            placeholderTextColor={t.role.inkMuted}
            style={{ ...theme.type.body, color: t.role.ink, flex: 1, padding: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
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
      <View style={{ marginTop: theme.space.sm, marginBottom: theme.space.md }}>
        <Card padded={false}>
          <Pressable
            onPress={() => {
              const oldest = drafts[0];
              if (oldest === undefined) return;
              tap();
              router.push(`/date/${oldest.id}/compose`);
            }}
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
                  {formatMoney(money(queued.totalMinor, ctx.currencyCode))}
                </Text>
                <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
                  {queued.stops === 1 ? '1 stop' : `${queued.stops} stops`}
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
                  <QueuedStopRow key={stop.id} stop={stop} nowMs={deps.clock.nowMs()} />
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
                onPress={() => { tap(); void attachPhotoToLatestQueued(); }}
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
        <View style={{ marginBottom: theme.space.md }}>
          <CalendarGrid
            periodMonth={periodMonth}
            todayLocal={todayLocal}
            days={heatDays}
            selectedDay={effectiveSelectedDay}
            onSelectDay={(day) => setSelectedDay((cur) => (cur === day ? null : day))}
            onStepMonth={(delta) => setPeriodMonth((p) => shiftMonth(p, delta))}
            canStepForward={periodMonth !== currentMonth}
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
            marginBottom: theme.space.sm,
            borderBottomWidth: 1,
            borderBottomColor: t.role.line,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
            <Ionicons name="calendar-outline" size={14} color={t.role.inkMuted} />
            <MicroLabel>{dayLabel(effectiveSelectedDay).toUpperCase()}</MicroLabel>
          </View>
          <Pressable onPress={() => setSelectedDay(null)} hitSlop={8}>
            <Text style={{ ...theme.type.meta, color: t.role.primary }}>All month</Text>
          </Pressable>
        </View>
      )}

      {isSearching ? (
        <SectionList
          style={{ flex: 1 }}
          sections={searchSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: theme.space.xxl, gap: theme.space.md }}
          renderSectionHeader={({ section }) => <MonthHeader section={section} currencyCode={ctx.currencyCode} />}
          renderItem={({ item }) => (
            <FeedCard date={item} onPress={() => router.push(`/date/${item.id}`)} />
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
          data={displayedMonthDates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: theme.space.xxl, gap: theme.space.md }}
          renderItem={({ item }) => (
            <FeedCard date={item} onPress={() => router.push(`/date/${item.id}`)} />
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
function MonthHeader({ section, currencyCode }: { section: MonthSection; currencyCode: string }) {
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
