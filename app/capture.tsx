import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto } from '@/domain/photos/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { kindsByRecentUse } from '@/domain/stops/recent';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { persistPickedImage } from '@/media/store';
import { getAppDeps, getLocalContext } from '@/session';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { KindChips } from '@/ui/KindChips';
import { theme } from '@/ui/theme';

export default function Capture() {
  const deps = getAppDeps();
  const ctx = getLocalContext();
  const kinds = useMemo(() => kindsByRecentUse(db, ctx.coupleId), [ctx.coupleId]);

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<StopKind>(kinds[0] ?? 'food');
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);

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
  };

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

      const result = captureStop(db, deps, {
        coupleId: ctx.coupleId,
        userId: ctx.userId,
        kind,
        amountMinor,
        currencyCode: ctx.currencyCode,
      });

      if (pendingPhoto && durablePhotoUri) {
        attachPhoto(db, deps, {
          dateId: result.dateId,
          stopId: result.stopId,
          localUri: durablePhotoUri,
          width: pendingPhoto.width,
          height: pendingPhoto.height,
        });
      }

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: theme.color.muted, fontSize: 16 }}>Cancel</Text>
        </Pressable>
        <Text style={{ color: budget.isOverBudget ? theme.color.rose : theme.color.muted }}>{remaining}</Text>
      </View>

      <AmountKeypad value={amount} onChange={setAmount} currencyCode={ctx.currencyCode} />

      <View style={{ paddingVertical: theme.space.md }}>
        <KindChips kinds={kinds} selected={kind} onSelect={setKind} />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md, marginTop: 'auto' }}>
        <Pressable
          onPress={pickPhoto}
          style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush }}
        >
          <Text style={{ fontSize: 20 }}>{pendingPhoto ? '✓📷' : '📷'}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink, opacity: saving ? 0.5 : 1 }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700', fontSize: 16 }}>Save</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
