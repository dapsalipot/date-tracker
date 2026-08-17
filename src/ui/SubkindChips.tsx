import { Pressable, ScrollView, Text } from 'react-native';
import { SUBKINDS, type StopKind } from '@/domain/stops/taxonomy';
import { KindIcon } from './KindIcon';
import { theme } from './theme';

interface Props {
  kind: StopKind;
  selected: string | null;
  onSelect: (next: string | null) => void;
}

/**
 * Subkind is always optional — spec §5 makes it settable in the composer and
 * never required — so tapping the selected chip clears it. `other` has no
 * subkinds at all, and rendering an empty scroller for it would look broken.
 *
 * Styling matches KindChips.tsx exactly (pill radius, outline-only treatment,
 * coloured by the parent kind) so the two chip rows read as one system.
 * contentContainerStyle omits horizontal padding because this component sits
 * inside an already-padded ScrollView in the stop editor, unlike KindChips'
 * unpadded container.
 */
export function SubkindChips({ kind, selected, onSelect }: Props) {
  const options = SUBKINDS[kind];
  if (options.length === 0) return null;

  const tint = theme.kind[kind];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(isSelected ? null : option)}
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
              {option}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
