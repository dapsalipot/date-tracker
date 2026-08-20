import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';

const HEART_COUNT = 5;
const HEART_SIZE = 28;

interface Props {
  value: number | null;
  onChange: (next: number | null) => void;
}

/**
 * Five tappable hearts, 1-5, filled up to the current rating. Tapping the
 * heart that is already the current rating clears it back to null (the same
 * tap-to-clear shape as `SubkindChips`), so a mis-tap is recoverable without
 * a separate clear control.
 */
export function HeartRating({ value, onChange }: Props) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
      {Array.from({ length: HEART_COUNT }, (_, i) => i + 1).map((n) => {
        const filled = value !== null && n <= value;
        return (
          <Pressable key={n} onPress={() => onChange(n === value ? null : n)} hitSlop={theme.space.xs}>
            <Ionicons
              name={filled ? 'heart' : 'heart-outline'}
              size={HEART_SIZE}
              color={filled ? t.role.primary : t.role.inkMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
