import { FlatList, Pressable, SafeAreaView, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery } from '@/domain/dates/compose';
import { stopsForDateQuery } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { theme } from '@/ui/theme';

export default function DateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: detailRows, updatedAt: detailUpdatedAt } = useLiveQuery(dateDetailQuery(db, id), [id]);
  const { data: stops } = useLiveQuery(stopsForDateQuery(db, id), [id]);
  const detail = detailRows[0] ?? null;

  // useLiveQuery returns [] on its first render, before the query has ever run,
  // so an empty result is ambiguous between "still loading" and "deleted". Only
  // updatedAt distinguishes them — it stays undefined until the first resolve.
  if (!detail) {
    if (detailUpdatedAt === undefined) {
      return <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }} />;
    }
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
          <Pressable onPress={() => router.push(`/date/${id}/stop/${item.id}`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.line }}>
              <View>
                <Text style={{ color: theme.color.ink }}>{item.label ?? item.kind}</Text>
                {item.placeName !== null && (
                  <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 2 }}>
                    {item.placeName}
                    {item.subkind !== null ? ` · ${item.subkind}` : ''}
                  </Text>
                )}
              </View>
              <Text style={{ color: theme.color.ink, fontWeight: '700' }}>
                {formatMoney(money(item.amountMinor, item.currencyCode))}
              </Text>
            </View>
          </Pressable>
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
