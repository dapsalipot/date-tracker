import { Pressable, ScrollView, Text } from 'react-native';
import type { StopKind } from '@/domain/stops/taxonomy';
import { KindIcon } from './KindIcon';
import { theme } from './theme';

const LABELS: Record<StopKind, string> = {
  food: 'Food',
  transport: 'Transport',
  activity: 'Activity',
  shopping: 'Shopping',
  gift: 'Gift',
  other: 'Other',
};

interface Props {
  kinds: readonly StopKind[];
  selected: StopKind;
  onSelect: (kind: StopKind) => void;
}

export function KindChips({ kinds, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.md }}>
      {kinds.map((kind) => {
        const isSelected = kind === selected;
        const tint = theme.kind[kind];
        return (
          <Pressable
            key={kind}
            onPress={() => onSelect(kind)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.xs,
              paddingHorizontal: theme.space.md,
              paddingVertical: theme.space.sm,
              borderRadius: 999,
              backgroundColor: 'transparent',
              borderWidth: isSelected ? 1.5 : 1,
              borderColor: isSelected ? tint : theme.role.line,
            }}
          >
            <KindIcon kind={kind} size={14} color={isSelected ? tint : theme.role.inkMuted} />
            <Text style={{ ...theme.type.meta, fontWeight: '600', color: isSelected ? tint : theme.role.inkMuted }}>
              {LABELS[kind]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
