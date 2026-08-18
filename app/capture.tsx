import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { captureStop } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { addPerson, lastPayerId, listPeople } from '@/domain/identity/people';
import { kindsByRecentUse } from '@/domain/stops/recent';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { recognizeReceipt } from '@/domain/receipts/recognize';
import type { ParsedReceipt } from '@/domain/receipts/parse';
import { minorToMajorString } from '@/domain/money/money';
import { persistPickedImage } from '@/media/store';
import { getAppDeps, getLocalContext } from '@/session';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { KindChips } from '@/ui/KindChips';
import { MicroLabel } from '@/ui/MicroLabel';
import { PayerPicker } from '@/ui/PayerPicker';
import { ReceiptReview } from '@/ui/ReceiptReview';
import { theme } from '@/ui/theme';
import { commit } from '@/ui/feedback';

/**
 * Who paid last, couple-wide. Not exposed by the domain layer, so this reads
 * `stops`/`dates` directly rather than growing a new domain query for one
 * screen-local default — the capture sheet already owns `db`.
 */
const PHOTO_TILE = 58;

export default function Capture() {
  const deps = getAppDeps();
  const ctx = getLocalContext();
  const kinds = useMemo(() => kindsByRecentUse(db, ctx.coupleId), [ctx.coupleId]);
  const [people, setPeople] = useState(() => listPeople(db, ctx.coupleId));
  const defaultPayerId = useMemo(() => lastPayerId(db, ctx.coupleId) ?? ctx.userId, [ctx.coupleId, ctx.userId]);

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<StopKind>(kinds[0] ?? 'food');
  const [payerId, setPayerId] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [scanning, setScanning] = useState(false);
  const [chosenItems, setChosenItems] = useState<number[]>([]);

  const selectedPayerId = payerId ?? defaultPayerId;

  const budget = useMemo(() => computeBudgetStatus(db, ctx, deps), [ctx, deps]);
  const remaining =
    budget.remainingMinor === null
      ? 'No budget set'
      : `${formatMoney(money(budget.remainingMinor, ctx.currencyCode))} left · ${budget.daysLeft}d`;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // A date without photos is completely valid — never a dead end.
      Alert.alert('Camera unavailable', 'You can still log the amount.');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    const asset = shot.assets?.[0];
    if (shot.canceled || !asset) return;
    setPendingPhoto({ uri: asset.uri, width: asset.width, height: asset.height });

    // Read the receipt in the background. The keypad stays live throughout —
    // OCR is a head start on typing, never a gate in front of it.
    setReceipt(null);
    setChosenItems([]);
    setScanning(true);
    try {
      setReceipt(await recognizeReceipt(asset.uri, ctx.currencyCode));
    } catch {
      // A photo that will not read is not an error worth interrupting for.
      // The photo is attached and the amount can still be typed.
      setReceipt(null);
    } finally {
      setScanning(false);
    }
  };

  /**
   * Ticking receipt items drives the amount directly: the sum of what is
   * ticked. That is what makes a receipt useful beyond its total — a bill
   * covering dinner and a gift becomes two stops, each holding only its own
   * lines, instead of one lump the dashboard cannot categorise.
   */
  const toggleItem = (index: number) => {
    const next = chosenItems.includes(index)
      ? chosenItems.filter((i) => i !== index)
      : [...chosenItems, index];
    setChosenItems(next);

    const sum = next.reduce((total, i) => total + (receipt?.items[i]?.amountMinor ?? 0), 0);
    setAmount(next.length === 0 ? '' : minorToMajorString(sum, ctx.currencyCode));
  };

  const useTotal = (amountMinor: number) => {
    setChosenItems([]);
    setAmount(minorToMajorString(amountMinor, ctx.currencyCode));
  };

  // Receipt order, not tap order, so the label reads like the bill.
  const receiptLabel =
    chosenItems.length === 0
      ? null
      : [...chosenItems]
          .sort((a, b) => a - b)
          .map((i) => receipt?.items[i]?.label)
          .filter((label): label is string => label !== undefined)
          .join(', ');

  const save = async () => {
    if (saving) return;

    let amountMinor: number;
    try {
      amountMinor = parseMajorToMinor(amount === '' ? '0' : amount, ctx.currencyCode).amountMinor;
    } catch {
      Alert.alert('That amount looks off', 'Enter a number like 420 or 420.50.');
      return;
    }

    setSaving(true);
    try {
      // Persist the photo to disk before writing anything to the database.
      // persistPickedImage is a pure file copy with no database effect, so if
      // it throws nothing has been written yet and a retry is clean. The
      // reverse order — commit the stop, then copy the file — meant a copy
      // failure left a stop already saved with no message and no navigation,
      // so the user's natural retry wrote a second, duplicate stop.
      let durablePhotoUri: string | null = null;
      if (pendingPhoto) {
        const photoFileName = `${deps.newId()}.jpg`;
        durablePhotoUri = persistPickedImage(pendingPhoto.uri, photoFileName);
      }

      // One call, one transaction. Passing the photo to captureStop rather than
      // attaching it afterwards removes the last window where a failure could
      // commit the stop and still report an error — which is what made a retry
      // write a duplicate charge.
      captureStop(db, deps, {
        coupleId: ctx.coupleId,
        userId: selectedPayerId,
        kind,
        amountMinor,
        currencyCode: ctx.currencyCode,
        label: receiptLabel,
        photo:
          pendingPhoto && durablePhotoUri
            ? {
                localUri: durablePhotoUri,
                width: pendingPhoto.width,
                height: pendingPhoto.height,
              }
            : null,
      });

      commit();
      router.back();
    } catch {
      // Leave the sheet open and the amount untouched — the work is still
      // there, whatever failed underneath.
      Alert.alert(
        'Could not save that',
        'Something went wrong saving this expense to your device. Your amount is still here — try Save again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
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
        <Button variant="quiet" label="Cancel" onPress={() => router.back()} />
        <Text style={{ ...theme.type.meta, color: budget.isOverBudget ? theme.role.primary : theme.role.inkMuted }}>
          {remaining}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: theme.space.md, gap: theme.space.md }}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Full-bleed rather than inset like the feed's cards: this keypad is
          the whole point of a five-second capture sheet, and giving it the
          entire width makes it the obvious hero rather than one card among
          several.
        */}
        <AmountKeypad value={amount} onChange={setAmount} currencyCode={ctx.currencyCode} />

        {(scanning || receipt !== null) && (
          <View style={{ paddingHorizontal: theme.space.md }}>
            {scanning ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                  <ActivityIndicator color={theme.role.primary} />
                  <Text style={{ ...theme.type.meta, color: theme.role.inkMuted }}>
                    Reading the receipt…
                  </Text>
                </View>
              </Card>
            ) : (
              receipt !== null && (
                <ReceiptReview
                  receipt={receipt}
                  currencyCode={ctx.currencyCode}
                  selected={chosenItems}
                  onToggleItem={toggleItem}
                  onUseTotal={useTotal}
                />
              )
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: theme.space.md, gap: theme.space.sm }}>
          <MicroLabel>WHO PAID</MicroLabel>
          <PayerPicker
            people={people}
            selected={selectedPayerId}
            onSelect={setPayerId}
            onAdd={(displayName) => {
              const id = addPerson(db, deps, ctx.coupleId, displayName);
              setPeople(listPeople(db, ctx.coupleId));
              return id;
            }}
          />
        </View>

        <View style={{ paddingHorizontal: theme.space.md }}>
          <MicroLabel>KIND</MicroLabel>
        </View>
        <KindChips kinds={kinds} selected={kind} onSelect={setKind} />
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.md,
          paddingTop: theme.space.sm,
          paddingBottom: theme.space.md,
        }}
      >
        <View style={{ width: PHOTO_TILE, height: PHOTO_TILE }}>
          <Card padded={false} onPress={() => { void pickPhoto(); }}>
            <View style={{ width: PHOTO_TILE, height: PHOTO_TILE, alignItems: 'center', justifyContent: 'center' }}>
              {pendingPhoto ? (
                <Image
                  source={{ uri: pendingPhoto.uri }}
                  style={{ width: PHOTO_TILE, height: PHOTO_TILE }}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="camera-outline" size={24} color={theme.role.inkMuted} />
              )}
            </View>
          </Card>
        </View>

        <View style={{ flex: 1 }}>
          <Button label={saving ? 'Saving…' : 'Save'} onPress={() => { void save(); }} disabled={saving} />
        </View>
      </View>
    </SafeAreaView>
  );
}
