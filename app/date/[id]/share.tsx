import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { dateDetailQuery } from '@/domain/dates/compose';
import { buildReceiptViewModel, type MoneyMode } from '@/domain/export/receipt';
import { ReceiptCanvas, RECEIPT_SIZES, type ReceiptSize } from '@/render/receipt/ReceiptTemplate';
import { shareReceipt } from '@/render/receipt/export';
import { theme } from '@/ui/theme';

/**
 * Plain language, not mode names. "tier" means nothing to someone deciding
 * how much of their evening to make public.
 */
const MODES: readonly { mode: MoneyMode; label: string }[] = [
  { mode: 'exact', label: 'Show amounts' },
  { mode: 'tier', label: 'Show ranges' },
  { mode: 'hidden', label: 'No money' },
];

const SIZES: readonly { size: ReceiptSize; label: string }[] = [
  { size: 'post', label: 'Post' },
  { size: 'story', label: 'Story' },
];

const PREVIEW_MARGIN = theme.space.md * 2;

export default function Share() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = getLocalContext();
  const deps = getAppDeps();

  // Defaults to `tier` per spec §2 — a privacy default, not a convenience one.
  const [moneyMode, setMoneyMode] = useState<MoneyMode>('tier');
  const [size, setSize] = useState<ReceiptSize>('post');
  const [sharing, setSharing] = useState(false);

  // Subscribing to the date keeps the preview honest: buildReceiptViewModel is
  // a plain read, so without `dateRows` in the dependency list an edit made
  // elsewhere would leave a stale receipt on screen.
  const { data: dateRows } = useLiveQuery(dateDetailQuery(db, id), [id]);
  const vm = useMemo(
    () => buildReceiptViewModel(db, ctx, id, moneyMode, deps.clock.todayLocal()),
    [id, moneyMode, ctx, deps, dateRows],
  );

  const target = RECEIPT_SIZES[size];
  const { width: windowWidth } = useWindowDimensions();
  const previewWidth = windowWidth - PREVIEW_MARGIN;
  const scale = previewWidth / target.width;

  const share = async () => {
    if (sharing || vm === null) return;
    // Claimed before the first await: set after, a second tap would sail past
    // this guard while the first call is still suspended.
    setSharing(true);
    try {
      await shareReceipt(vm, size);
    } catch (err) {
      // shareReceipt throws deliberately and distinguishably — it has no UI of
      // its own, so the message belongs here. Spec §10 wants a retry offered
      // rather than a dead end.
      const detail =
        err instanceof Error && err.message.includes('not available')
          ? 'Sharing is turned off on this device.'
          : 'Something went wrong making the image.';
      Alert.alert('Could not share that', detail, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Try again', onPress: () => { void share(); } },
      ]);
    } finally {
      setSharing(false);
    }
  };

  if (vm === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That date no longer exists.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
        {/*
          The canvas always renders at its true export size; only this box
          scales it to fit. That is the point of Skia here — the exported
          pixels do not depend on this phone's screen.
        */}
        <View
          style={{
            width: previewWidth,
            height: target.height * scale,
            overflow: 'hidden',
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.line,
            alignSelf: 'center',
          }}
        >
          <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
            <ReceiptCanvas vm={vm} size={size} />
          </View>
        </View>

        <Text style={{ color: theme.color.muted, textAlign: 'center' }}>
          {vm.stopCount === 1 ? '1 stop' : `${vm.stopCount} stops`} · {vm.occurredOn}
        </Text>

        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>MONEY</Text>
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {MODES.map((option) => {
            const selected = option.mode === moneyMode;
            return (
              <Pressable
                key={option.mode}
                onPress={() => setMoneyMode(option.mode)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: theme.space.sm,
                  borderRadius: 999,
                  backgroundColor: selected ? theme.color.rose : theme.color.blush,
                }}
              >
                <Text style={{ fontWeight: '600', color: selected ? theme.color.cream : theme.color.ink }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>SIZE</Text>
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {SIZES.map((option) => {
            const selected = option.size === size;
            return (
              <Pressable
                key={option.size}
                onPress={() => setSize(option.size)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: theme.space.sm,
                  borderRadius: 999,
                  backgroundColor: selected ? theme.color.ink : theme.color.blush,
                }}
              >
                <Text style={{ fontWeight: '600', color: selected ? theme.color.cream : theme.color.ink }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={share}
          disabled={sharing}
          style={{
            alignItems: 'center',
            paddingVertical: theme.space.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.ink,
            opacity: sharing ? 0.4 : 1,
          }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700', fontSize: 16 }}>
            {sharing ? 'Preparing…' : 'Share'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
