import { useMemo } from 'react';
import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { loadDateDetail } from '@/domain/dates/compose';
import { listStopsForDate } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { theme } from '@/ui/theme';

export default function DateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useMemo(() => loadDateDetail(db, id), [id]);
  const stops = useMemo(() => listStopsForDate(db, id), [id]);

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That date no longer exists.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <View style={{ padding: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {detail.occurredOn.toUpperCase()} · {detail.status.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.color.ink }}>
          {detail.title ?? 'Untitled date'}
        </Text>
      </View>

      <FlatList
        data={stops}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.line }}>
            <Text style={{ color: theme.color.ink }}>{item.label ?? item.kind}</Text>
            <Text style={{ color: theme.color.ink, fontWeight: '700' }}>
              {formatMoney(money(item.amountMinor, item.currencyCode))}
            </Text>
          </View>
        )}
      />

      <Pressable
        onPress={() => router.push(`/date/${id}/compose`)}
        style={{ margin: theme.space.md, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
      >
        <Text style={{ color: theme.color.cream, fontWeight: '700' }}>Edit</Text>
      </Pressable>
    </SafeAreaView>
  );
}
