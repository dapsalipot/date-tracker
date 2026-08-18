import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Person } from '@/domain/identity/people';
import { Button } from './Button';
import { Card } from './Card';
import { MicroLabel } from './MicroLabel';
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
 * Adding a person swaps this row for a text field in place. It used to call
 * Alert.prompt, which exists only on iOS and was a silent no-op on Android —
 * no dialog, no error, no person. A React Native Modal replaced it and failed
 * too, for the opposite reason: both call sites sit on screens that are
 * themselves presented as sheets, and iOS will not present a modal from a view
 * controller already presenting one, so it opened nothing and logged nothing.
 * Editing in place needs no presentation at all and behaves the same on both
 * platforms.
 */
export function PayerPicker({ people, selected, onSelect, onAdd }: Props) {
  const [asking, setAsking] = useState(false);
  const [draftName, setDraftName] = useState('');

  const promptForName = () => {
    setDraftName('');
    setAsking(true);
  };

  const confirmName = () => {
    let id: string;
    try {
      id = onAdd(draftName);
    } catch {
      // addPerson rejects a name that is blank once trimmed. Keep the sheet
      // open with the text intact rather than closing and losing it.
      return;
    }
    setAsking(false);
    onSelect(id);
    commit();
  };

  // Trimmed, because the domain rejects a name that is only whitespace and the
  // button should not offer to do what it will refuse.
  const canConfirm = draftName.trim() !== '';

  const nameField = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      <Ionicons name="person-add-outline" size={16} color={theme.role.primary} />
      <TextInput
        value={draftName}
        onChangeText={setDraftName}
        placeholder="Their name"
        placeholderTextColor={theme.role.inkMuted}
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={() => { if (canConfirm) confirmName(); }}
        style={{
          ...theme.type.body,
          color: theme.role.ink,
          flex: 1,
          paddingVertical: theme.space.xs,
          borderBottomWidth: 1,
          borderBottomColor: theme.role.line,
        }}
      />
      <Pressable onPress={() => setAsking(false)} hitSlop={8}>
        <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>Cancel</Text>
      </Pressable>
      <Pressable onPress={confirmName} disabled={!canConfirm} hitSlop={8}>
        <Text style={{ ...theme.type.meta, fontWeight: '600', color: canConfirm ? theme.role.primary : theme.role.inkMuted }}>
          Add
        </Text>
      </Pressable>
    </View>
  );

  if (asking) return nameField;

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
