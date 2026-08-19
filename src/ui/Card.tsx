import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';
import { tap } from './feedback';

/**
 * Shared with `FeedHero`, which needs the same press feedback but forks the
 * rest of the surface (full-bleed photo, no mat) — see `src/render/FeedCard.tsx`.
 * Sharing this instead of letting the hero reimplement it is what keeps that
 * fork from also silently drifting out of animation sync with every other card.
 */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The paper border around a print. 6pt reads as a mat; less reads as a mistake. */
const MAT_INSET = 6;

/** The 0.985 press-scale every card in the feed uses, `Card` included. */
export function usePressScale() {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value === 1 ? 0.985 : 1, { duration: theme.motion.fast }) }],
  }));
  return {
    animatedStyle,
    onPressIn: () => { pressed.value = 1; },
    onPressOut: () => { pressed.value = 0; },
  };
}

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
  const { animatedStyle, onPressIn, onPressOut } = usePressScale();
  // V4: same failed-load tracking as CalendarGrid/FeedHero — a photoUri
  // whose Image errors (stale path) falls back to no photo at all rather
  // than an empty hole where the mat photo should be. Keyed by the uri
  // itself so a fresh photoUri on the same instance isn't stuck hidden.
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);
  const showPhoto = photoUri !== null && photoUri !== undefined && photoUri !== failedPhotoUri;

  // overflow: 'hidden' sets masksToBounds on iOS, which clips a layer's own
  // shadow along with its children. Split the lift onto an outer wrapper and
  // keep the clip (radius, border, background, overflow) on an inner view so
  // the shadow can render outside the clipped bounds.
  const lift = {
    borderRadius: theme.radius.lg,
    // Null in dark by design — a shadow on a near-black ground is invisible and
    // a glow standing in for one reads as a rendering bug.
    ...(t.lift ?? {}),
  };

  const clip = {
    backgroundColor: t.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: t.role.line,
    overflow: 'hidden' as const,
    padding: padded ? theme.space.md : 0,
  };

  const content = (
    <>
      {showPhoto && (
        <Image
          source={{ uri: photoUri as string }}
          style={{
            height: photoHeight ?? 120,
            margin: MAT_INSET,
            borderRadius: theme.radius.md,
          }}
          resizeMode="cover"
          onError={() => setFailedPhotoUri(photoUri ?? null)}
        />
      )}
      {children}
    </>
  );

  if (onPress === undefined) {
    return (
      <View style={lift}>
        <View style={clip}>{content}</View>
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={() => { tap(); onPress(); }}
      style={[lift, animatedStyle]}
    >
      <View style={clip}>{content}</View>
    </AnimatedPressable>
  );
}
