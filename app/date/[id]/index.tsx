import { FlatList, Image, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery } from '@/domain/dates/compose';
import { photosForDateQuery } from '@/domain/photos/repository';
import { reorderStops, stopsForDateQuery } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { getAppDeps } from '@/session';
import { theme } from '@/ui/theme';

export default function DateDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: detailRows, updatedAt: detailUpdatedAt } = useLiveQuery(dateDetailQuery(db, id), [id]);
  const { data: stops } = useLiveQuery(stopsForDateQuery(db, id), [id]);
  const { data: photos } = useLiveQuery(photosForDateQuery(db, id), [id]);
  const detail = detailRows[0] ?? null;

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;

    const ordered = stops.map((s) => s.id);
    const moved = ordered[index];
    const displaced = ordered[target];
    if (moved === undefined || displaced === undefined) return;
    ordered[index] = displaced;
    ordered[target] = moved;

    reorderStops(db, getAppDeps(), id, ordered);
  };

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

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingHorizontal: theme.space.md, paddingBottom: theme.space.sm }}>
          {photos.map((photo) =>
            photo.localUri === null ? null : (
              <Image
                key={photo.id}
                source={{ uri: photo.localUri }}
                style={{ width: 96, height: 120, borderRadius: theme.radius.md }}
                resizeMode="cover"
              />
            ),
          )}
        </ScrollView>
      )}

      <FlatList
        data={stops}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: theme.space.md }}
        renderItem={({ item, index }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.color.line }}>
            {/*
              Only this column navigates. The reorder arrows below are a
              sibling, not nested inside this Pressable: a disabled Pressable
              (the up arrow on row 0, the down arrow on the last row) does not
              claim the responder, so a nested disabled arrow would let the
              touch fall through to this row's onPress and navigate instead
              of no-opping. Keeping them as siblings avoids that regardless of
              disabled state.
            */}
            <Pressable onPress={() => router.push(`/date/${id}/stop/${item.id}`)} style={{ flex: 1 }}>
              <View>
                <Text style={{ color: theme.color.ink }}>{item.label ?? item.kind}</Text>
                {/*
                  Either field alone is enough to show this line. Gating on
                  placeName hid the subkind entirely for the common case:
                  place is free text you have to type, subkind is one tap, so
                  tapping "cafe" and saving looked like nothing happened.
                */}
                {(item.placeName !== null || item.subkind !== null) && (
                  <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 2 }}>
                    {[item.placeName, item.subkind].filter((part) => part !== null).join(' · ')}
                  </Text>
                )}
              </View>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Pressable
                onPress={() => move(index, -1)}
                hitSlop={8}
                disabled={index === 0}
                style={{ opacity: index === 0 ? 0.25 : 1 }}
              >
                <Text style={{ color: theme.color.muted, fontSize: 18 }}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => move(index, 1)}
                hitSlop={8}
                disabled={index === stops.length - 1}
                style={{ opacity: index === stops.length - 1 ? 0.25 : 1 }}
              >
                <Text style={{ color: theme.color.muted, fontSize: 18 }}>↓</Text>
              </Pressable>
              <Text style={{ color: theme.color.ink, fontWeight: '700' }}>
                {formatMoney(money(item.amountMinor, item.currencyCode))}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={{ flexDirection: 'row', gap: theme.space.sm, margin: theme.space.md }}>
        <Pressable
          onPress={() => router.push(`/date/${id}/compose`)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700' }}>Edit</Text>
        </Pressable>

        {/*
          Published only. A draft has no story yet, so offering to post it is
          offering to post "Untitled date".
        */}
        <Pressable
          onPress={() => router.push(`/date/${id}/share`)}
          disabled={detail.status !== 'published'}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: theme.space.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.blush,
            opacity: detail.status === 'published' ? 1 : 0.35,
          }}
        >
          <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Share</Text>
        </Pressable>

        {/*
          A draft has no story yet — offering to post it is offering to post
          "Untitled date". Share only appears once the date is published.
        */}
        {detail.status === 'published' && (
          <Pressable
            onPress={() => router.push(`/date/${id}/share`)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush }}
          >
            <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Share</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
