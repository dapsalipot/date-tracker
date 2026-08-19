import { Image, Text, View } from 'react-native';
import type { FeedDate } from '@/domain/dates/repository';
import { formatMoney, money } from '@/domain/money/money';
import { Card } from '@/ui/Card';
import { isStopKind, KindIcon } from '@/ui/KindIcon';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';

const COVER_HEIGHT = 96;

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
 * A `Card`: the strip and cards-with-space-between direction the editorial
 * layout was rejected in favour of. Most dates never get a cover photo, so
 * the no-photo layout is the default appearance — it goes straight from the
 * card's rounded top to the body, no reserved block and no placeholder.
 *
 * `Card` itself owns the press scale and the `tap()` haptic, so this
 * component has no animation or gesture code of its own.
 */
export function FeedCard({ date, onPress }: Props) {
  const t = useTheme();
  const total = formatMoney(money(date.totalMinor, date.currencyCode));
  const stopLabel = date.stopCount === 1 ? '1 stop' : `${date.stopCount} stops`;

  return (
    <Card padded={false} onPress={onPress}>
      {date.coverUri !== null && (
        <Image
          source={{ uri: date.coverUri }}
          style={{ width: '100%', height: COVER_HEIGHT }}
          resizeMode="cover"
        />
      )}

      <View style={{ padding: theme.space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text
            style={{ ...theme.type.title, color: t.role.ink, flex: 1, marginRight: theme.space.sm }}
            numberOfLines={1}
          >
            {date.title ?? 'Untitled date'}
          </Text>
          <Text style={{ ...theme.type.title, color: t.role.ink }}>{total}</Text>
        </View>

        <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
          {formatDateLabel(date.occurredOn)} · {stopLabel}
        </Text>

        {date.kinds.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginTop: theme.space.sm }}>
            {date.kinds.map((kind) => {
              const tint = isStopKind(kind) ? t.kind[kind] : t.kind.other;
              return (
                <View
                  key={kind}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: theme.space.sm,
                    paddingVertical: 3,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: tint,
                  }}
                >
                  <KindIcon kind={kind} size={12} color={tint} />
                  <Text style={{ ...theme.type.micro, color: tint }}>{kindLabel(kind)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Card>
  );
}
