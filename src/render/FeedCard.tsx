import { Image, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { FeedDate } from '@/domain/dates/repository';
import { formatMoney, money } from '@/domain/money/money';
import { MicroLabel } from '@/ui/MicroLabel';
import { theme } from '@/ui/theme';
import { tap } from '@/ui/feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const COVER_ASPECT_RATIO = 4 / 5;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * "2026-07-29" -> "29 JUL". Sliced from the ISO string rather than built via
 * `Date`, which parses as UTC midnight and can shift the day once rendered in
 * a non-UTC timezone — the round-trip the rest of the app deliberately avoids.
 */
function formatDateLabel(occurredOn: string): string {
  const day = occurredOn.slice(8, 10);
  const monthIndex = Number.parseInt(occurredOn.slice(5, 7), 10) - 1;
  return `${day} ${MONTHS[monthIndex] ?? ''}`;
}

interface Props {
  date: FeedDate;
  onPress: () => void;
}

/**
 * An editorial entry, not a card: no border, no fill of its own. Most dates
 * never get a cover photo, so the no-photo layout is the default appearance —
 * it ends at the meta line with no reserved block, not a placeholder.
 *
 * The image (when present) is full-bleed: this component carries no
 * horizontal padding of its own so the photo can span edge to edge, and the
 * text block below applies `theme.screenMargin` itself. The FlatList that
 * renders these must not add horizontal padding, or the bleed is lost.
 */
export function FeedCard({ date, onPress }: Props) {
  const total = formatMoney(money(date.totalMinor, date.currencyCode));
  const stopLabel = date.stopCount === 1 ? '1 stop' : `${date.stopCount} stops`;

  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.99 : 1, { duration: theme.motion.fast }) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      style={[{ marginBottom: theme.space.xl }, animated]}
    >
      <View style={{ paddingHorizontal: theme.screenMargin, marginTop: theme.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
          {date.status === 'published' && (
            <View style={{ width: 2, height: 12, backgroundColor: theme.role.gold }} />
          )}
          <MicroLabel>{formatDateLabel(date.occurredOn)}</MicroLabel>
        </View>
        <Text
          style={{ ...theme.type.display, color: theme.role.ink, marginTop: theme.space.xs }}
          numberOfLines={2}
        >
          {date.title ?? 'Untitled date'}
        </Text>
        <Text style={{ ...theme.type.meta, color: theme.role.inkMuted, marginTop: theme.space.xs }}>
          {stopLabel} · {total}
        </Text>
      </View>

      {date.coverUri !== null && (
        <Image
          source={{ uri: date.coverUri }}
          style={{ width: '100%', aspectRatio: COVER_ASPECT_RATIO, marginTop: theme.space.md }}
          resizeMode="cover"
        />
      )}
    </AnimatedPressable>
  );
}
