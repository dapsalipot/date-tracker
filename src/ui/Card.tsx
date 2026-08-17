import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { tap } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The raised surface this direction is built on. No border: the ground is
 * darker than the card, which is what makes it read as raised. Adding a border
 * would be solving a hierarchy problem with ornament.
 */
export function Card({
  children,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
}) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.985 : 1, { duration: theme.motion.fast }) }],
  }));

  const surface = {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden' as const,
    padding: padded ? theme.space.md : 0,
  };

  if (onPress === undefined) return <View style={surface}>{children}</View>;

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      style={[surface, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
