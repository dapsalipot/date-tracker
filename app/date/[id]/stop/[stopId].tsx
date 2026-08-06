import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { getAppDeps } from '@/session';
import { deleteStop, stopsForDateQuery, updateStop } from '@/domain/stops/edit';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { SubkindChips } from '@/ui/SubkindChips';
import { theme } from '@/ui/theme';

/**
 * The keypad starts EMPTY rather than seeded with the saved amount.
 *
 * AmountKeypad is an append-only widget that caps the fraction at the
 * currency's minor-unit exponent. A seeded "420.00" is already at that cap, so
 * every digit key silently no-ops and only backspace works — editing the amount
 * of any 2-decimal currency becomes impossible. The keypad returns before
 * calling onChange, so the screen cannot intercept the tap and recover.
 *
 * Empty means "leave the amount alone": `save` omits amountMinor from the patch
 * entirely, and `updateStop` writes only the keys it is given. The saved amount
 * is shown above the keypad so the field is never ambiguous.
 */
const AMOUNT_UNCHANGED = '';

export default function StopEditor() {
  const { id, stopId } = useLocalSearchParams<{ id: string; stopId: string }>();
  const deps = getAppDeps();
  const { data: stops, updatedAt } = useLiveQuery(stopsForDateQuery(db, id), [id]);
  const stop = stops.find((s) => s.id === stopId) ?? null;

  const [draft, setDraft] = useState<{
    label: string; placeName: string; subkind: string | null; amount: string;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);

  // useLiveQuery returns [] before its first resolve, so an absent stop is
  // ambiguous between loading and deleted until updatedAt is set. A third case:
  // we deleted it ourselves and are already navigating away.
  if (!stop) {
    if (updatedAt === undefined || leaving) {
      return <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }} />;
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That stop is gone.</Text>
      </SafeAreaView>
    );
  }

  // Seed the edit buffer from the row the first time we have one. Editing a
  // live-query row directly would fight every re-render.
  const current = draft ?? {
    label: stop.label ?? '',
    placeName: stop.placeName ?? '',
    subkind: stop.subkind,
    amount: AMOUNT_UNCHANGED,
  };
  const patch = (next: Partial<typeof current>) => setDraft({ ...current, ...next });

  const save = () => {
    let amountPatch: { amountMinor?: number } = {};
    if (current.amount !== AMOUNT_UNCHANGED) {
      try {
        amountPatch = {
          amountMinor: parseMajorToMinor(current.amount, stop.currencyCode).amountMinor,
        };
      } catch {
        Alert.alert('That amount looks off', 'Enter a number like 420 or 420.50.');
        return;
      }
    }

    updateStop(db, deps, stop.id, {
      label: current.label.trim() === '' ? null : current.label.trim(),
      placeName: current.placeName.trim() === '' ? null : current.placeName.trim(),
      subkind: current.subkind,
      ...amountPatch,
    });
    setLeaving(true);
    router.back();
  };

  const confirmDelete = () => {
    Alert.alert('Remove this stop?', 'It will disappear from the date and its totals.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          // Flag before the write: the live query updates on a microtask fired
          // from a native change event, while a popped screen stays mounted for
          // its exit animation. Without this the row vanishes mid-transition and
          // the user sees "That stop is gone." as the reward for a successful,
          // deliberate delete.
          setLeaving(true);
          deleteStop(db, deps, stop.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {stop.kind.toUpperCase()}
        </Text>

        <Text style={{ color: theme.color.muted }}>
          {current.amount === AMOUNT_UNCHANGED
            ? `Now ${formatMoney(money(stop.amountMinor, stop.currencyCode))} — type to change it`
            : 'New amount'}
        </Text>

        <AmountKeypad
          value={current.amount}
          onChange={(amount) => patch({ amount })}
          currencyCode={stop.currencyCode}
        />

        <SubkindChips
          kind={stop.kind as StopKind}
          selected={current.subkind}
          onSelect={(subkind) => patch({ subkind })}
        />

        <TextInput
          value={current.label}
          onChangeText={(label) => patch({ label })}
          placeholder="What was it?"
          placeholderTextColor={theme.color.muted}
          style={{ borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, padding: theme.space.md, color: theme.color.ink, backgroundColor: '#FFFFFF' }}
        />

        <TextInput
          value={current.placeName}
          onChangeText={(placeName) => patch({ placeName })}
          placeholder="Where?"
          placeholderTextColor={theme.color.muted}
          style={{ borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, padding: theme.space.md, color: theme.color.ink, backgroundColor: '#FFFFFF' }}
        />

        <Pressable
          onPress={save}
          style={{ alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700', fontSize: 16 }}>Save</Text>
        </Pressable>

        <Pressable onPress={confirmDelete} style={{ alignItems: 'center', paddingVertical: theme.space.sm }}>
          <Text style={{ color: theme.color.rose, fontWeight: '600' }}>Remove stop</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
