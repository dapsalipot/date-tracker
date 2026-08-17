import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Person } from '@/domain/identity/people';
import { commit, tap } from './feedback';
import { theme } from './theme';

interface Props {
  people: readonly Person[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Screen owns the write — this picker never touches the database itself. */
  onAdd: (displayName: string) => string;
}

const ADD_LABEL = 'Add someone';

/**
 * "Who paid" chips, outlined in `theme.role.primary` when selected — never
 * `theme.kind.*`, since a payer isn't a stop kind. A single-person couple
 * would see a picker with nothing to pick between, so that case collapses to
 * a quiet add affordance instead of a one-chip row.
 *
 * No horizontal padding of its own — like SubkindChips, not KindChips — since
 * its two call sites disagree on whether the parent already pads: the capture
 * sheet's unpadded flex column adds it around the whole picker, the stop
 * editor's ScrollView already pads every child.
 *
 * ponytail: name entry uses the platform Alert.prompt, which is iOS-only.
 * Android would need a bespoke text-input modal if that platform matters.
 */
export function PayerPicker({ people, selected, onSelect, onAdd }: Props) {
  const promptForName = () => {
    Alert.prompt('Who paid?', undefined, (name) => {
      try {
        const id = onAdd(name);
        onSelect(id);
        commit();
      } catch {
        Alert.alert('Needs a name', 'Enter a name for this person.');
      }
    });
  };

  if (people.length <= 1) {
    return (
      <Pressable
        onPress={() => { tap(); promptForName(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}
      >
        <Ionicons name="person-add-outline" size={14} color={theme.role.inkMuted} />
        <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>{ADD_LABEL}</Text>
      </Pressable>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space.sm }}
    >
      {people.map((person) => {
        const isSelected = person.id === selected;
        return (
          <Pressable
            key={person.id}
            onPress={() => { tap(); onSelect(person.id); }}
            style={{
              paddingHorizontal: theme.space.md,
              paddingVertical: theme.space.sm,
              borderRadius: 999,
              borderWidth: isSelected ? 1.5 : 1,
              borderColor: isSelected ? theme.role.primary : theme.role.line,
            }}
          >
            <Text style={{ ...theme.type.meta, fontWeight: '600', color: isSelected ? theme.role.primary : theme.role.inkMuted }}>
              {person.displayName}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => { tap(); promptForName(); }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.xs,
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.role.line,
        }}
      >
        <Ionicons name="person-add-outline" size={14} color={theme.role.inkMuted} />
        <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>{ADD_LABEL}</Text>
      </Pressable>
    </ScrollView>
  );
}
