import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { deleteStop, stopsForDateQuery, updateStop } from '@/domain/stops/edit';
import { addPerson, listPeople } from '@/domain/identity/people';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import { SUBKINDS, type StopKind } from '@/domain/stops/taxonomy';
import { kindLabel } from '@/render/FeedCard';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { isStopKind, KindIcon } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { PayerPicker } from '@/ui/PayerPicker';
import { Rule } from '@/ui/Rule';
import { SubkindChips } from '@/ui/SubkindChips';
import { theme } from '@/ui/theme';
import { commit } from '@/ui/feedback';

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
  const ctx = getLocalContext();
  const { data: stops, updatedAt } = useLiveQuery(stopsForDateQuery(db, id), [id]);
  const stop = stops.find((s) => s.id === stopId) ?? null;

  const [people, setPeople] = useState(() => listPeople(db, ctx.coupleId));
  const [draft, setDraft] = useState<{
    label: string; placeName: string; subkind: string | null; amount: string; paidByUserId: string | null;
  } | null>(null);
  const [leaving, setLeaving] = useState(false);

  // useLiveQuery returns [] before its first resolve, so an absent stop is
  // ambiguous between loading and deleted until updatedAt is set. A third case:
  // we deleted it ourselves and are already navigating away.
  if (!stop) {
    if (updatedAt === undefined || leaving) {
      return (
        <>
          <Stack.Screen options={{ headerShown: false }} />
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground }} />
        </>
      );
    }
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground, justifyContent: 'center', padding: theme.space.lg }}>
          <Card>
            <Text style={{ ...theme.type.body, color: theme.role.ink, textAlign: 'center' }}>That stop is gone.</Text>
          </Card>
        </SafeAreaView>
      </>
    );
  }

  // Seed the edit buffer from the row the first time we have one. Editing a
  // live-query row directly would fight every re-render.
  const current = draft ?? {
    label: stop.label ?? '',
    placeName: stop.placeName ?? '',
    subkind: stop.subkind,
    amount: AMOUNT_UNCHANGED,
    paidByUserId: stop.paidByUserId,
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
      // paidByUserId has no "clear" state in the patch — omitted leaves the
      // existing attribution untouched, which matches an unset picker.
      ...(current.paidByUserId ? { paidByUserId: current.paidByUserId } : {}),
    });
    commit();
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
          commit();
          router.back();
        },
      },
    ]);
  };

  const tint = isStopKind(stop.kind) ? theme.kind[stop.kind] : theme.kind.other;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space.md,
            paddingTop: theme.space.sm,
          }}
        >
          <Button variant="quiet" label="Back" onPress={() => router.back()} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.xs,
              paddingHorizontal: theme.space.md,
              paddingVertical: theme.space.sm,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: tint,
            }}
          >
            <KindIcon kind={stop.kind} size={14} color={tint} />
            <Text style={{ ...theme.type.meta, fontWeight: '600', color: tint }}>{kindLabel(stop.kind)}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
          <MicroLabel>
            {current.amount === AMOUNT_UNCHANGED ? 'TYPE TO CHANGE AMOUNT' : 'NEW AMOUNT'}
          </MicroLabel>

          <AmountKeypad
            value={current.amount}
            onChange={(amount) => patch({ amount })}
            currencyCode={stop.currencyCode}
            placeholder={formatMoney(money(stop.amountMinor, stop.currencyCode))}
          />

          {SUBKINDS[stop.kind as StopKind]?.length > 0 && (
            <View style={{ gap: theme.space.sm }}>
              <MicroLabel>SUBKIND</MicroLabel>
              <SubkindChips
                kind={stop.kind as StopKind}
                selected={current.subkind}
                onSelect={(subkind) => patch({ subkind })}
              />
            </View>
          )}

          <View style={{ gap: theme.space.sm }}>
            <MicroLabel>WHO PAID</MicroLabel>
            <PayerPicker
              people={people}
              selected={current.paidByUserId}
              onSelect={(paidByUserId) => patch({ paidByUserId })}
              onAdd={(displayName) => {
                const personId = addPerson(db, deps, ctx.coupleId, displayName);
                setPeople(listPeople(db, ctx.coupleId));
                return personId;
              }}
            />
          </View>

          <Card>
            <TextInput
              value={current.label}
              onChangeText={(label) => patch({ label })}
              placeholder="What was it?"
              placeholderTextColor={theme.role.inkMuted}
              style={{ ...theme.type.body, color: theme.role.ink, padding: 0 }}
            />
            <View style={{ marginVertical: theme.space.sm }}>
              <Rule />
            </View>
            <TextInput
              value={current.placeName}
              onChangeText={(placeName) => patch({ placeName })}
              placeholder="Where?"
              placeholderTextColor={theme.role.inkMuted}
              style={{ ...theme.type.body, color: theme.role.ink, padding: 0 }}
            />
          </Card>

          <Button label="Save" onPress={save} />
          <Button variant="danger" label="Remove stop" onPress={confirmDelete} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
