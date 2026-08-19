import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';
import { tap } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The paper border around a print. 6pt reads as a mat; less reads as a mistake. */
const MAT_INSET = 6;

/**
 * The raised surface this direction is built on. Hairline border defines the card
 * edge in light mode; in dark mode, depth comes from the lighter surface and border.
 * Lift shadow makes it float above the ground in light mode.
 */
export function Card({
  children,
  onPress,
  padded = true,
  photoUri,
  photoHeight,
}: {
  children: ReactNode;
  onPress?: () => void;
  padded?: boolean;
  photoUri?: string | null;
  photoHeight?: number;
}) {
  const t = useTheme();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.985 : 1, { duration: theme.motion.fast }) }],
  }));

  const surface = {
    backgroundColor: t.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: t.role.line,
    overflow: 'hidden' as const,
    padding: padded ? theme.space.md : 0,
    // Null in dark by design — a shadow on a near-black ground is invisible and
    // a glow standing in for one reads as a rendering bug.
    ...(t.lift ?? {}),
  };

  const content = (
    <>
      {photoUri !== null && photoUri !== undefined && (
        <Image
          source={{ uri: photoUri }}
          style={{
            height: photoHeight ?? 120,
            margin: MAT_INSET,
            borderRadius: theme.radius.md,
          }}
          resizeMode="cover"
        />
      )}
      {children}
    </>
  );

  if (onPress === undefined) return <View style={surface}>{content}</View>;

  return (
    <AnimatedPressable
      onPressIn={() => { pressed.value = 1; }}
      onPressOut={() => { pressed.value = 0; }}
      onPress={() => { tap(); onPress(); }}
      style={[surface, animated]}
    >
      {content}
    </AnimatedPressable>
  );
}
