import { FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery } from '@/domain/dates/compose';
import { photosForDateQuery } from '@/domain/photos/repository';
import { reorderStops, stopsForDateQuery } from '@/domain/stops/edit';
import { formatMoney, money } from '@/domain/money/money';
import { getAppDeps } from '@/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { KindIcon } from '@/ui/KindIcon';
import { MicroLabel } from '@/ui/MicroLabel';
import { Rule } from '@/ui/Rule';
import { theme } from '@/ui/theme';
import { tap } from '@/ui/feedback';

const PHOTO_WIDTH = 96;
const PHOTO_HEIGHT = 120;

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

    tap();
    reorderStops(db, getAppDeps(), id, ordered);
  };

  // useLiveQuery returns [] on its first render, before the query has ever run,
  // so an empty result is ambiguous between "still loading" and "deleted". Only
  // updatedAt distinguishes them — it stays undefined until the first resolve.
  if (!detail) {
    if (detailUpdatedAt === undefined) {
      return <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground }} />;
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground, justifyContent: 'center', padding: theme.space.lg }}>
        <Card>
          <Text style={{ ...theme.type.body, color: theme.role.ink, textAlign: 'center' }}>
            That date no longer exists.
          </Text>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.role.ground }}>
      <View style={{ padding: theme.space.md, gap: theme.space.md }}>
        <Card>
          <MicroLabel>
            {detail.occurredOn.toUpperCase()} · {detail.status.toUpperCase()}
          </MicroLabel>
          <Text style={{ ...theme.type.title, color: theme.role.ink, marginTop: theme.space.xs }}>
            {detail.title ?? 'Untitled date'}
          </Text>
        </Card>

        {photos.length > 0 && (
          <Card>
            <MicroLabel>PHOTOS</MicroLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.space.sm, marginTop: theme.space.sm }}
            >
              {photos.map((photo) =>
                photo.localUri === null ? null : (
                  <View
                    key={photo.id}
                    style={{
                      width: PHOTO_WIDTH,
                      height: PHOTO_HEIGHT,
                      borderRadius: theme.radius.md,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: theme.role.line,
                    }}
                  >
                    <Image
                      source={{ uri: photo.localUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                ),
              )}
            </ScrollView>
          </Card>
        )}
      </View>

      {/* flex: 1 lets the stop list itself scroll independently, below the
          fixed header/photos above and the fixed buttons below. */}
      <View style={{ flex: 1, paddingHorizontal: theme.space.md }}>
        <Card padded={false}>
          <FlatList
            data={stops}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ paddingHorizontal: theme.space.md }}
            ItemSeparatorComponent={Rule}
            renderItem={({ item, index }) => (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.space.sm }}>
                {/*
                  Only this column navigates. The reorder arrows below are a
                  sibling, not nested inside this Pressable: a disabled Pressable
                  (the up arrow on row 0, the down arrow on the last row) does not
                  claim the responder, so a nested disabled arrow would let the
                  touch fall through to this row's onPress and navigate instead
                  of no-opping. Keeping them as siblings avoids that regardless of
                  disabled state.
                */}
                <Pressable
                  onPress={() => { tap(); router.push(`/date/${id}/stop/${item.id}`); }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}
                >
                  <KindIcon kind={item.kind} size={16} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...theme.type.body, color: theme.role.ink }}>{item.label ?? item.kind}</Text>
                    {/*
                      Either field alone is enough to show this line. Gating on
                      placeName hid the subkind entirely for the common case:
                      place is free text you have to type, subkind is one tap, so
                      tapping "cafe" and saving looked like nothing happened.
                    */}
                    {(item.placeName !== null || item.subkind !== null) && (
                      <Text style={{ ...theme.type.meta, color: theme.role.inkMuted, marginTop: 2 }}>
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
                    <Ionicons name="chevron-up-outline" size={18} color={theme.role.inkMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => move(index, 1)}
                    hitSlop={8}
                    disabled={index === stops.length - 1}
                    style={{ opacity: index === stops.length - 1 ? 0.25 : 1 }}
                  >
                    <Ionicons name="chevron-down-outline" size={18} color={theme.role.inkMuted} />
                  </Pressable>
                  <Text style={{ ...theme.type.body, color: theme.role.ink, fontWeight: '700' }}>
                    {formatMoney(money(item.amountMinor, item.currencyCode))}
                  </Text>
                </View>
              </View>
            )}
          />
        </Card>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, margin: theme.space.md }}>
        <View style={{ flex: 1 }}>
          <Button variant="quiet" label="Edit" onPress={() => router.push(`/date/${id}/compose`)} />
        </View>

        {/*
          A draft has no story yet — offering to post it is offering to post
          "Untitled date". Share only appears once the date is published.
        */}
        {detail.status === 'published' && (
          <View style={{ flex: 1 }}>
            <Button label="Share" onPress={() => router.push(`/date/${id}/share`)} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
