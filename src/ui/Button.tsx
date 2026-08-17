import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { tap } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'quiet' | 'danger';

const SURFACE: Record<Variant, { background: string; border: string; text: string }> = {
  primary: { background: theme.role.primary, border: theme.role.primary, text: theme.role.onPrimary },
  quiet: { background: 'transparent', border: theme.role.line, text: theme.role.ink },
  danger: { background: 'transparent', border: 'transparent', text: theme.role.primary },
};

/**
 * Press feedback lives here so motion is consistent by construction rather
 * than by discipline. A screen that hand-rolls a Pressable will visibly lack
 * it, which is the point — the gap becomes obvious instead of invisible.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}) {
  const pressed = useSharedValue(0);
  const surface = SURFACE[variant];

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.97 : 1, { duration: theme.motion.fast }) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      disabled={disabled}
      style={[
        {
          paddingVertical: theme.space.md,
          alignItems: 'center',
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: surface.border,
          backgroundColor: surface.background,
          opacity: disabled ? 0.35 : 1,
        },
        animated,
      ]}
    >
      <Text style={{ ...theme.type.body, fontWeight: '600', color: surface.text }}>{label}</Text>
    </AnimatedPressable>
  );
}
