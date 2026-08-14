import { Image, Pressable, Text, View } from 'react-native';
import type { FeedDate } from '@/domain/dates/repository';
import { formatMoney, money } from '@/domain/money/money';
import { theme } from '@/ui/theme';

const COVER_ASPECT_RATIO = 4 / 5;

/** Height of the tinted band shown when a date has no cover photo. */
const NO_COVER_BAND_HEIGHT = 72;

/**
 * Most dates will never have a photo, so the no-cover case is the default
 * appearance rather than a degraded one. A flat tint keyed off the date's id
 * gives the feed rhythm and makes each card recognisable on return, without
 * pretending a photo exists.
 */
const TINTS = [theme.color.blush, theme.color.line, theme.color.cream] as const;

function tintFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 997;
  }
  return TINTS[hash % TINTS.length] ?? theme.color.blush;
}

/**
 * Code-point aware rather than `charAt(0)`. Titles like "🎉 Anniversary" are
 * exactly the copy this app invites, and an emoji is a surrogate pair — taking
 * the first UTF-16 unit yields a lone high surrogate that renders as tofu.
 */
function initialOf(title: string | null): string {
  const first = Array.from((title ?? '').trim())[0];
  return first === undefined ? '·' : first.toUpperCase();
}

interface Props {
  date: FeedDate;
  onPress: () => void;
}

export function FeedCard({ date, onPress }: Props) {
  const total = formatMoney(money(date.totalMinor, date.currencyCode));
  const stopLabel = date.stopCount === 1 ? '1 stop' : `${date.stopCount} stops`;

  return (
    <Pressable
      onPress={onPress}
      style={{
        marginBottom: theme.space.md,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: theme.color.line,
      }}
    >
      {date.coverUri ? (
        <Image
          source={{ uri: date.coverUri }}
          style={{ width: '100%', aspectRatio: COVER_ASPECT_RATIO }}
          resizeMode="cover"
        />
      ) : (
        // No photo: a slim tinted band, not a photo-sized hole. Reserving the
        // full 4:5 block for a single letter meant one date filled the screen,
        // and since most dates never get a photo that was the normal case —
        // the feed became unscannable. The band still gives each card its own
        // colour so it stays recognisable on return.
        <View
          style={{
            width: '100%',
            height: NO_COVER_BAND_HEIGHT,
            backgroundColor: tintFor(date.id),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.color.muted }}>
            {initialOf(date.title)}
          </Text>
        </View>
      )}

      <View style={{ padding: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {date.occurredOn.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: theme.color.ink, marginTop: 2 }}>
          {date.title ?? 'Untitled date'}
        </Text>
        <Text style={{ color: theme.color.muted, marginTop: 4 }}>
          {stopLabel} · {total}
        </Text>
      </View>
    </Pressable>
  );
}
