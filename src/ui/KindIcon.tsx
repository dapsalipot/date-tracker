import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { STOP_KINDS, type StopKind } from '@/domain/stops/taxonomy';
import { useTheme } from './ThemeProvider';

type Glyph = ComponentProps<typeof Ionicons>['name'];

const GLYPH: Record<StopKind, Glyph> = {
  food: 'restaurant-outline',
  transport: 'car-outline',
  activity: 'ticket-outline',
  shopping: 'bag-outline',
  gift: 'gift-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

/** `stops.kind` is a plain string at the DB boundary; narrow it once, here. */
export function isStopKind(value: string): value is StopKind {
  return (STOP_KINDS as readonly string[]).includes(value);
}

interface Props {
  kind: string;
  size?: number;
  color?: string;
}

/**
 * One glyph per stop kind. An unrecognised kind string falls back to
 * `other`'s icon and colour rather than rendering nothing. Colour defaults to
 * the kind's own theme colour — callers only pass one where the icon sits on
 * a coloured surface (e.g. inside a filled button) and needs to invert.
 */
export function KindIcon({ kind, size = 16, color }: Props) {
  const t = useTheme();
  const resolved = isStopKind(kind) ? kind : 'other';
  return <Ionicons name={GLYPH[resolved]} size={size} color={color ?? t.kind[resolved]} />;
}
