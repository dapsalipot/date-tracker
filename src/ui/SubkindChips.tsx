import { Pressable, ScrollView, Text } from 'react-native';
import { SUBKINDS, type StopKind } from '@/domain/stops/taxonomy';
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
 * Styling matches KindChips.tsx exactly (pill radius, rose/blush treatment)
 * so the two chip rows read as one system. contentContainerStyle omits
 * horizontal padding because this component sits inside an already-padded
 * ScrollView in the stop editor, unlike KindChips' unpadded container.
 */
export function SubkindChips({ kind, selected, onSelect }: Props) {
  const options = SUBKINDS[kind];
  if (options.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(isSelected ? null : option)}
            style={{
              paddingHorizontal: theme.space.md,
              paddingVertical: theme.space.sm,
              borderRadius: 999,
              backgroundColor: isSelected ? theme.color.rose : theme.color.blush,
            }}
          >
            <Text style={{ fontWeight: '600', color: isSelected ? theme.color.cream : theme.color.ink }}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
