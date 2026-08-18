import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
 * Name entry is a plain modal rather than Alert.prompt. Alert.prompt exists
 * only on iOS and is a silent no-op on Android, so adding a person there did
 * nothing at all — no dialog, no error, no person.
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

  const nameSheet = (
    <Modal visible={asking} transparent animationType="fade" onRequestClose={() => setAsking(false)}>
      <Pressable
        onPress={() => setAsking(false)}
        style={{
          flex: 1,
          backgroundColor: '#000000CC',
          justifyContent: 'center',
          padding: theme.space.md,
        }}
      >
        {/* Swallows the press so tapping the card itself does not dismiss it. */}
        <Pressable onPress={() => {}}>
          <Card>
            <View style={{ gap: theme.space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
                <Ionicons name="person-add-outline" size={16} color={theme.role.primary} />
                <MicroLabel>WHO PAID</MicroLabel>
              </View>

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
                  ...theme.type.title,
                  color: theme.role.ink,
                  paddingVertical: theme.space.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.role.line,
                }}
              />

              <View style={{ flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.xs }}>
                <View style={{ flex: 1 }}>
                  <Button variant="quiet" label="Cancel" onPress={() => setAsking(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Add" onPress={confirmName} disabled={!canConfirm} />
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (people.length <= 1) {
    return (
      <>
      {nameSheet}
      <Pressable
        onPress={() => { tap(); promptForName(); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}
      >
        <Ionicons name="person-add-outline" size={14} color={theme.role.inkMuted} />
        <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>{ADD_LABEL}</Text>
      </Pressable>
      </>
    );
  }

  return (
    <>
    {nameSheet}
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
    </>
  );
}
