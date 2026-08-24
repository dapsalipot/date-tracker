import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { FeedDate } from '@/domain/dates/repository';
import { formatMoney, money } from '@/domain/money/money';
import { AnimatedPressable, Card, usePressScale } from '@/ui/Card';
import { KindIcon } from '@/ui/KindIcon';
import { photoUri } from '@/media/store';
import { ON_PHOTO, ON_PHOTO_MUTED, PHOTO_SCRIM } from '@/ui/photoOverlay';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';
import { tap } from '@/ui/feedback';

const COVER_HEIGHT = 96;
/** 16:9 — the hero's fixed aspect ratio, independent of device width. */
const HERO_ASPECT = 16 / 9;

const WEEKDAYS_BY_ZELLER_H = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Zeller's congruence, run on the ISO string's own digits. No `Date` is built,
 * so there is no UTC-midnight parse to shift the day once rendered in a
 * non-UTC timezone — the round-trip the rest of the app deliberately avoids.
 * h=0 is Saturday .. h=6 is Friday for the Gregorian calendar.
 */
function zellerH(year: number, month: number, day: number): number {
  const isJanOrFeb = month < 3;
  const m = isJanOrFeb ? month + 12 : month;
  const y = isJanOrFeb ? year - 1 : year;
  const k = y % 100;
  const j = Math.floor(y / 100);
  return (day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
}

/** "2026-07-29" -> "Sat 29 Jul". */
function formatDateLabel(occurredOn: string): string {
  const year = Number.parseInt(occurredOn.slice(0, 4), 10);
  const month = Number.parseInt(occurredOn.slice(5, 7), 10);
  const day = Number.parseInt(occurredOn.slice(8, 10), 10);
  const weekday = WEEKDAYS_BY_ZELLER_H[zellerH(year, month, day)] ?? '';
  return `${weekday} ${day} ${MONTHS[month - 1] ?? ''}`;
}

/** Exported so the feed's queued-stop rows can label a kind the same way. */
export function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

interface Props {
  date: FeedDate;
  onPress: () => void;
}

/**
 * A `Card`, matted: the photo (if any) sits inset inside the bordered card
 * rather than bleeding to its edges, distinguishing it from `FeedHero` below.
 * Most dates never get a cover photo, so the no-photo layout is the default
 * appearance — it goes straight from the card's rounded top to the body, no
 * reserved block and no placeholder.
 *
 * `Card` itself owns the press scale and the `tap()` haptic, so this
 * component has no animation or gesture code of its own.
 */
export function FeedCard({ date, onPress }: Props) {
  const t = useTheme();
  const total = formatMoney(money(date.totalMinor, date.currencyCode));
  const stopLabel = date.stopCount === 1 ? '1 stop' : `${date.stopCount} stops`;

  return (
    <Card
      padded={false}
      onPress={onPress}
      photoUri={date.coverUri !== null ? photoUri(date.coverUri) : null}
      photoHeight={COVER_HEIGHT}
      radius={theme.radius.md}
    >
      <View style={{ padding: theme.space.sm }}>
        {/*
          V4 fix: `subtitle` (17px) replaces `title` (22px) here — this card
          is half the screen wide in the two-up grid, and title-size type
          left no room to also fit the amount without wrapping mid-sentence.
          The amount gets its own line below the date/stop-count meta line
          instead of sharing a row with either — at two-up width there isn't
          reliably enough room next to a realistic title AND a five-figure
          total, but a line to itself always fits.
        */}
        <Text style={{ ...theme.type.subtitle, color: t.role.ink }} numberOfLines={1}>
          {date.title ?? 'Untitled date'}
        </Text>

        <Text
          style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}
          numberOfLines={1}
        >
          {formatDateLabel(date.occurredOn)} · {stopLabel}
        </Text>

        <Text
          style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}
          numberOfLines={1}
        >
          {total}
        </Text>

        {/*
          Spec §8: the stop timeline as icons in stop order — the shape of
          the evening. `kindSequence` is ordered and not deduped, so this can
          render `[food, activity, food]` for a dinner -> gig -> late-night-
          food evening; `date.kinds` (distinct, alphabetically sorted) would
          collapse that to `[activity, food]` and lose both the order and the
          repetition. Keyed by index since the same kind can repeat.
        */}
        {date.kindSequence.length > 0 && (
          <View style={{ flexDirection: 'row', gap: theme.space.xs, marginTop: theme.space.sm }}>
            {date.kindSequence.map((kind, index) => (
              <KindIcon key={`${kind}-${index}`} kind={kind} size={13} />
            ))}
          </View>
        )}

        {date.places.length > 0 && (
          <Text
            style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}
            numberOfLines={1}
          >
            {date.places.join(' · ')}
          </Text>
        )}

        {date.payerCount > 1 && (
          <Text style={{ ...theme.type.micro, color: t.role.primary, marginTop: theme.space.xs }}>
            SPLIT
          </Text>
        )}
      </View>
    </Card>
  );
}

/**
 * The one full-bleed card at the top of a month: the newest published date,
 * shown large. Deliberately not a `Card` with `photoUri` — that mats the
 * photo, and the hero is the one place in the feed that should not be.
 * Title and meta sit over a bottom scrim so they read against any photo
 * brightness; without a photo they sit directly on the card's own surface,
 * following the same no-placeholder rule `FeedCard` uses.
 */
export function FeedHero({ date, onPress }: Props) {
  const t = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  const total = formatMoney(money(date.totalMinor, date.currencyCode));
  const stopLabel = date.stopCount === 1 ? '1 stop' : `${date.stopCount} stops`;
  // Resolved against the *current* documents directory — the failed-load
  // tracking below is keyed by this same resolved value, not the stored
  // one, so the two stay consistent.
  const resolvedCoverUri = date.coverUri !== null ? photoUri(date.coverUri) : null;
  // Same failed-load tracking `CalendarGrid` uses for its day cells: a stale
  // absolute path fails to load, and without this the hero would keep trying
  // to render a photo layout (scrim + white text) over nothing. Stored as
  // the failed uri itself, not a boolean, so a new hero date with a working
  // cover isn't stuck coverless by a previous date's failure.
  const [failedCoverUri, setFailedCoverUri] = useState<string | null>(null);
  const hasCover = resolvedCoverUri !== null && resolvedCoverUri !== failedCoverUri;

  const caption = (
    <>
      <Text style={{ ...theme.type.display, color: hasCover ? ON_PHOTO : t.role.ink }} numberOfLines={1}>
        {date.title ?? 'Untitled date'}
      </Text>
      <Text
        style={{
          ...theme.type.meta,
          color: hasCover ? ON_PHOTO_MUTED : t.role.inkMuted,
          marginTop: theme.space.xs,
        }}
      >
        {formatDateLabel(date.occurredOn)} · {stopLabel} · {total}
      </Text>
    </>
  );

  return (
    <AnimatedPressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={() => { tap(); onPress(); }}
      style={[
        {
          // Same radius as every other card — the hero is bigger, not a
          // different shape. overflow: 'hidden' clips masksToBounds' own
          // shadow along with its children on iOS, so the lift lives on this
          // outer, unclipped view and the clip (radius/border/background) on
          // an inner one — see Card.tsx for the same split.
          borderRadius: theme.radius.lg,
          ...(t.lift ?? {}),
        },
        animatedStyle,
      ]}
    >
      <View
        style={{
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          backgroundColor: t.role.surface,
          borderWidth: 1,
          borderColor: t.role.line,
        }}
      >
        {hasCover ? (
          <View style={{ width: '100%', aspectRatio: HERO_ASPECT }}>
            <Image
              source={{ uri: resolvedCoverUri as string }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              onError={() => setFailedCoverUri(resolvedCoverUri)}
            />
            <View
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: theme.space.md, backgroundColor: PHOTO_SCRIM,
              }}
            >
              {caption}
            </View>
          </View>
        ) : (
          <View style={{ padding: theme.space.md }}>{caption}</View>
        )}
      </View>
    </AnimatedPressable>
  );
}
