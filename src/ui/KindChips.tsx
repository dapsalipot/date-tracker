import { Pressable, ScrollView, Text } from 'react-native';
import type { StopKind } from '@/domain/stops/taxonomy';
import { theme } from './theme';

const LABELS: Record<StopKind, string> = {
  food: '🍽 Food',
  transport: '🚗 Transport',
  activity: '🎟 Activity',
  shopping: '🛍 Shopping',
  gift: '🎁 Gift',
  other: '• Other',
};

interface Props {
  kinds: readonly StopKind[];
  selected: StopKind;
  onSelect: (kind: StopKind) => void;
}

export function KindChips({ kinds, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.md }}>
      {kinds.map((kind) => (
        <Pressable
          key={kind}
          onPress={() => onSelect(kind)}
          style={{
            paddingHorizontal: theme.space.md,
            paddingVertical: theme.space.sm,
            borderRadius: 999,
            backgroundColor: kind === selected ? theme.color.rose : theme.color.blush,
          }}
        >
          <Text style={{ fontWeight: '600', color: kind === selected ? theme.color.cream : theme.color.ink }}>
            {LABELS[kind]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
