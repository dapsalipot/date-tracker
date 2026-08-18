import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { ringArcs, type RingInput } from './ringGeometry';
import { theme } from './theme';

/**
 * A ring of a month's spend by kind, with the total in the hole.
 *
 * A ring rather than a pie because the hole is useful: it holds the figure the
 * slices are shares of, so one glance answers both "how much" and "on what".
 * A filled pie spends its centre — the part the eye lands on first — on
 * nothing.
 *
 * All arithmetic lives in `ringGeometry`, which runs in plain Node and is
 * tested there. This file only paints.
 */
export function Ring({
  slices,
  tintOf,
  size = 132,
  thickness = 14,
  children,
}: {
  slices: readonly RingInput[];
  tintOf: (key: string) => string;
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const paths = useMemo(() => {
    // The stroke straddles the path, so the circle it follows sits half a
    // thickness inside the canvas or the ring is clipped on all four sides.
    const inset = thickness / 2;
    const oval = { x: inset, y: inset, width: size - thickness, height: size - thickness };

    // Built here rather than in the render body: Skia.Path.Make allocates a
    // native object, and doing that per arc per render leaves one behind every
    // time the month changes.
    return ringArcs(slices).map((arc) => {
      const path = Skia.Path.Make();
      path.addArc(oval, arc.startAngle, arc.sweepAngle);
      return { key: arc.key, path };
    });
  }, [slices, size, thickness]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ width: size, height: size, position: 'absolute' }}>
        {paths.map(({ key, path }) => {
          return (
            <Path
              key={key}
              path={path}
              style="stroke"
              strokeWidth={thickness}
              // Butt, not round: round caps add half a thickness to each end,
              // which closes the gaps between neighbours and, on a slice of a
              // few degrees, is most of the arc's apparent size.
              strokeCap="butt"
              color={tintOf(key)}
            />
          );
        })}
      </Canvas>

      {/* Sits in the hole. Kept out of the canvas so it uses the app's real
          type rather than Skia's font handling. */}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

/** The ground showing through when there is nothing to draw. */
export const RING_EMPTY_TINT = theme.role.line;
