import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { toFeedDate, type FeedDate } from '@/domain/dates/repository';
import { draftDatesQuery, listQueuedStops, publishedDatesQuery, type QueuedStop } from '@/domain/dates/drafts';
import { formatMoney, money } from '@/domain/money/money';
import { attachPhoto } from '@/domain/photos/repository';
import { persistPickedImage } from '@/media/store';
import { FeedCard, kindLabel } from '@/render/FeedCard';
import { seedTwelveMonths } from '@/fixtures/seed';
import { getAppDeps, getLocalContext } from '@/session';
import { Card } from '@/ui/Card';
import { KindIcon } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { Rule } from '@/ui/Rule';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
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
  // sections and each section's own dates — no re-sort needed.
  const sections = useMemo(() => {
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
          <Ionicons name="search-outline" size={18} color={theme.role.inkMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search dates, e.g. aug or 2026-08"
            placeholderTextColor={theme.role.inkMuted}
            style={{ ...theme.type.body, color: theme.role.ink, flex: 1, padding: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={theme.role.inkMuted} />
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

          {visibleQueuedStops.length > 0 && (
            <View style={{ paddingHorizontal: theme.space.md, paddingBottom: theme.space.sm }}>
              <Rule />
              <View style={{ marginTop: theme.space.sm, gap: theme.space.xs }}>
                {visibleQueuedStops.map((stop) => (
                  <QueuedStopRow key={stop.id} stop={stop} nowMs={deps.clock.nowMs()} />
                ))}
                {overflowCount > 0 && (
                  <Text style={{ ...theme.type.micro, color: theme.role.inkMuted, marginTop: 2 }}>
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
                  backgroundColor: theme.role.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: attachingPhoto ? 0.5 : 1,
                }}
              >
                <Ionicons name="camera-outline" size={16} color={theme.role.onPrimary} />
              </Pressable>
            </View>
          )}
        </Card>
      </View>

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: theme.space.xxl, gap: theme.space.md }}
        renderSectionHeader={({ section }) => <MonthHeader section={section} currencyCode={ctx.currencyCode} />}
        renderItem={({ item }) => (
          <FeedCard date={item} onPress={() => router.push(`/date/${item.id}`)} />
        )}
        ListEmptyComponent={
          drafts.length === 0 && published.length === 0 ? (
            <Card onPress={() => seedTwelveMonths(db, ctx.coupleId, ctx.userId, deps.clock.todayLocal(), deps)}>
              <Text style={{ ...theme.type.body, fontWeight: '600', color: theme.role.ink, textAlign: 'center' }}>
                Seed 12 months of demo dates
              </Text>
            </Card>
          ) : search.trim() !== '' ? (
            <Card>
              <Text style={{ ...theme.type.body, color: theme.role.inkMuted, textAlign: 'center' }}>
                No dates match "{search.trim()}"
              </Text>
            </Card>
          ) : null
        }
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
        <Ionicons name="add" size={30} color={theme.role.onPrimary} />
      </Pressable>
    </Screen>
  );
}

/** One queued stop: its kind, what it was, what it cost, and when it landed. */
function QueuedStopRow({ stop, nowMs }: { stop: QueuedStop; nowMs: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
      <KindIcon kind={stop.kind} size={14} />
      <Text numberOfLines={1} style={{ ...theme.type.meta, color: theme.role.ink, flex: 1 }}>
        {stop.label ?? kindLabel(stop.kind)}
      </Text>
      <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>
        {formatMoney(money(stop.amountMinor, stop.currencyCode))}
      </Text>
      <Text style={{ ...theme.type.micro, color: theme.role.inkMuted, minWidth: 52, textAlign: 'right' }}>
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
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: theme.space.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.role.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
        <Ionicons name="calendar-outline" size={14} color={theme.role.inkMuted} />
        <MicroLabel>{section.title.toUpperCase()}</MicroLabel>
      </View>
      <Text style={{ ...theme.type.body, color: theme.role.ink, fontWeight: '600' }}>
        {formatMoney(money(section.totalMinor, currencyCode))}
      </Text>
    </View>
  );
}
