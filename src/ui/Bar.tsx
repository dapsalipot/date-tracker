import { Pressable, Text, View } from 'react-native';
import { theme } from './theme';

interface Segment {
  fraction: number;
  color: string;
}

interface Props {
  label: string;
  value: string;
  fraction: number;
  tint?: string;
  segments?: Segment[];
  onPress?: () => void;
}

const TRACK_HEIGHT = 10;

/**
 * One horizontal bar: label left, value right, a fill sized to `fraction`.
 * Renders only the strings it is given — formatting money is the caller's job,
 * so this component has no currency awareness at all.
 *
 * `segments`, when given, replaces the single fill with a row of flex-weighted
 * fills — one per segment, coloured by `segments[].color` — leaving any
 * unfilled remainder as bare track.
 */
export function Bar({ label, value, fraction, tint = theme.role.primary, segments, onPress }: Props) {
  // Spend over budget, or a slice measured against the wrong reference total,
  // yields a fraction above 1 — clamp so the fill never outgrows its track.
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%` as const;

  const segmentTotal = segments?.reduce((sum, segment) => sum + segment.fraction, 0) ?? 0;
  const remainder = Math.max(0, 1 - segmentTotal);

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ gap: theme.space.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.color.ink, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: theme.color.muted }}>{value}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: theme.role.line,
          overflow: 'hidden',
        }}
      >
        {segments ? (
          <>
            {segments.map((segment, index) => (
              <View key={index} style={{ flex: segment.fraction, backgroundColor: segment.color }} />
            ))}
            {remainder > 0 && <View style={{ flex: remainder }} />}
          </>
        ) : (
          <View style={{ width, height: '100%', borderRadius: TRACK_HEIGHT / 2, backgroundColor: tint }} />
        )}
      </View>
    </Pressable>
  );
}
