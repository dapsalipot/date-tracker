import { Image, Pressable, Text, View } from 'react-native';
import type { FeedDate } from '@/domain/dates/repository';
import { formatMoney, money } from '@/domain/money/money';
import { theme } from '@/ui/theme';

const COVER_ASPECT_RATIO = 4 / 5;

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
        <View
          style={{
            width: '100%',
            aspectRatio: COVER_ASPECT_RATIO,
            backgroundColor: tintFor(date.id),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 40, fontWeight: '800', color: theme.color.muted }}>
            {(date.title ?? '·').trim().charAt(0).toUpperCase() || '·'}
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
