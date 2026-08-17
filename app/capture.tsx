import { useMemo, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { db } from '@/db/client';
import { captureStop } from '@/domain/dates/repository';
import { computeBudgetStatus } from '@/domain/budget/status';
import { kindsByRecentUse } from '@/domain/stops/recent';
import { formatMoney, money, parseMajorToMinor } from '@/domain/money/money';
import type { StopKind } from '@/domain/stops/taxonomy';
import { persistPickedImage } from '@/media/store';
import { getAppDeps, getLocalContext } from '@/session';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { KindChips } from '@/ui/KindChips';
import { MicroLabel } from '@/ui/MicroLabel';
import { theme } from '@/ui/theme';
import { commit } from '@/ui/feedback';

const PHOTO_TILE = 58;

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

      // One call, one transaction. Passing the photo to captureStop rather than
      // attaching it afterwards removes the last window where a failure could
      // commit the stop and still report an error — which is what made a retry
      // write a duplicate charge.
      captureStop(db, deps, {
        coupleId: ctx.coupleId,
        userId: ctx.userId,
        kind,
        amountMinor,
        currencyCode: ctx.currencyCode,
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

      <View style={{ flex: 1, paddingTop: theme.space.md, gap: theme.space.md }}>
        {/*
          Full-bleed rather than inset like the feed's cards: this keypad is
          the whole point of a five-second capture sheet, and giving it the
          entire width makes it the obvious hero rather than one card among
          several.
        */}
        <AmountKeypad value={amount} onChange={setAmount} currencyCode={ctx.currencyCode} />

        <View style={{ paddingHorizontal: theme.space.md }}>
          <MicroLabel>KIND</MicroLabel>
        </View>
        <KindChips kinds={kinds} selected={kind} onSelect={setKind} />
      </View>

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
