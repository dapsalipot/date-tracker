import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery } from '@/domain/dates/compose';
import { buildReceiptViewModel, type MoneyMode } from '@/domain/export/receipt';
import { shareReceipt } from '@/render/receipt/export';
import { RECEIPT_SIZES, ReceiptCanvas, type ReceiptSize } from '@/render/receipt/ReceiptTemplate';
import { getAppDeps, getLocalContext } from '@/session';
import { theme } from '@/ui/theme';

// Mode names ('exact' | 'tier' | 'hidden') are internal vocabulary from spec
// §7.5 — a reader picking a privacy level thinks in terms of what shows up,
// not what the domain calls it.
const MONEY_MODES: readonly { mode: MoneyMode; label: string }[] = [
  { mode: 'exact', label: 'Show amounts' },
  { mode: 'tier', label: 'Show ranges' },
  { mode: 'hidden', label: 'No money' },
];

const SIZES: readonly { size: ReceiptSize; label: string }[] = [
  { size: 'post', label: 'Post' },
  { size: 'story', label: 'Story' },
];

export default function Share() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ctx = getLocalContext();
  const deps = getAppDeps();
  const { width: windowWidth } = useWindowDimensions();

  // buildReceiptViewModel below is a plain synchronous read — it does not
  // consume `dateRows` itself. Its only job here is to give useMemo a value
  // that changes when the underlying tables do, so an edit made elsewhere
  // (e.g. the compose screen) refreshes this preview.
  const { data: dateRows } = useLiveQuery(dateDetailQuery(db, id), [id]);

  // Spec §2: tier is the privacy default. Never default to 'exact' for
  // convenience.
  const [moneyMode, setMoneyMode] = useState<MoneyMode>('tier');
  const [size, setSize] = useState<ReceiptSize>('post');
  const [sharing, setSharing] = useState(false);

  const vm = useMemo(
    () => buildReceiptViewModel(db, ctx, id, moneyMode, deps.clock.todayLocal()),
    [id, moneyMode, ctx, deps, dateRows],
  );

  const { width: fullWidth, height: fullHeight } = RECEIPT_SIZES[size];
  const previewWidth = windowWidth - theme.space.lg * 2;
  const scale = previewWidth / fullWidth;

  const share = async () => {
    if (sharing || vm === null) return;
    // Claimed before the first await: setting this after the isAvailableAsync
    // check would let a second tap land while the first is suspended there
    // and pass this guard too. This project has shipped that race before.
    setSharing(true);
    try {
      await shareReceipt(vm, size);
    } catch {
      Alert.alert('Could not share that', 'Something went wrong making the image.');
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
      <ScrollView contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.lg, alignItems: 'center' }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted, alignSelf: 'flex-start' }}>
          SHARE
        </Text>

        {/*
          The 1080px-wide export canvas is scaled down to fit a ~390pt phone.
          The outer view clips to the scaled footprint (transform does not
          change layout size); the inner view renders ReceiptCanvas at its
          true pixel size and is scaled from its top-left corner so it fills
          the clipped box exactly rather than scaling from center.
        */}
        <View
          style={{
            width: previewWidth,
            height: fullHeight * scale,
            overflow: 'hidden',
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.line,
            backgroundColor: '#FFFFFF',
          }}
        >
          <View style={{ width: fullWidth, height: fullHeight, transform: [{ scale }], transformOrigin: 'top left' }}>
            <ReceiptCanvas vm={vm} size={size} />
          </View>
        </View>

        <View style={{ width: '100%', gap: theme.space.sm }}>
          <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>MONEY ON THE RECEIPT</Text>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            {MONEY_MODES.map(({ mode, label }) => (
              <Pressable
                key={mode}
                onPress={() => setMoneyMode(mode)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: theme.space.sm,
                  borderRadius: theme.radius.md,
                  backgroundColor: moneyMode === mode ? theme.color.ink : theme.color.blush,
                }}
              >
                <Text style={{ color: moneyMode === mode ? theme.color.cream : theme.color.ink, fontWeight: '600', fontSize: 13 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ width: '100%', gap: theme.space.sm }}>
          <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>FORMAT</Text>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            {SIZES.map(({ size: candidate, label }) => (
              <Pressable
                key={candidate}
                onPress={() => setSize(candidate)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: theme.space.sm,
                  borderRadius: theme.radius.md,
                  backgroundColor: size === candidate ? theme.color.ink : theme.color.blush,
                }}
              >
                <Text style={{ color: size === candidate ? theme.color.cream : theme.color.ink, fontWeight: '600', fontSize: 13 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <Pressable
        onPress={share}
        disabled={sharing}
        style={{
          margin: theme.space.md,
          alignItems: 'center',
          paddingVertical: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.ink,
          opacity: sharing ? 0.5 : 1,
        }}
      >
        <Text style={{ color: theme.color.cream, fontWeight: '700' }}>{sharing ? 'Sharing…' : 'Share'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
