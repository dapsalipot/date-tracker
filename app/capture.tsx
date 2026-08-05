import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db, appDeps } from '@/db/client';
import { ensureLocalContext } from '@/domain/identity/bootstrap';
import { captureStop } from '@/domain/dates/repository';
import { attachPhoto } from '@/domain/photos/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { kindsByRecentUse } from '@/domain/stops/recent';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { persistPickedImage } from '@/media/store';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { KindChips } from '@/ui/KindChips';
import { theme } from '@/ui/theme';

export default function Capture() {
  const deps = useMemo(() => appDeps('Asia/Manila'), []);
  const ctx = useMemo(() => ensureLocalContext(db, deps), [deps]);
  const kinds = useMemo(() => kindsByRecentUse(db, ctx.coupleId), [ctx.coupleId]);

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<StopKind>(kinds[0] ?? 'food');
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);

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
    let amountMinor: number;
    try {
      amountMinor = parseMajorToMinor(amount === '' ? '0' : amount, ctx.currencyCode).amountMinor;
    } catch {
      Alert.alert('That amount looks off', 'Enter a number like 420 or 420.50.');
      return;
    }

    const result = captureStop(db, deps, {
      coupleId: ctx.coupleId,
      userId: ctx.userId,
      kind,
      amountMinor,
      currencyCode: ctx.currencyCode,
    });

    if (pendingPhoto) {
      const durable = persistPickedImage(pendingPhoto.uri, `${result.stopId}.jpg`);
      attachPhoto(db, deps, {
        dateId: result.dateId,
        stopId: result.stopId,
        localUri: durable,
        width: pendingPhoto.width,
        height: pendingPhoto.height,
      });
    }

    router.back();
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
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700', fontSize: 16 }}>Save</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
