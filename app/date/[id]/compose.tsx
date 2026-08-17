import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery, loadDateDetail, publishDate, updateDateDetails } from '@/domain/dates/compose';
import { setCoverPhoto } from '@/domain/dates/cover';
import { attachPhoto, detachPhoto, photosForDateQuery } from '@/domain/photos/repository';
import { persistPickedImage } from '@/media/store';
import { getAppDeps } from '@/session';
import { theme } from '@/ui/theme';

export default function Compose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deps = getAppDeps();
  const detail = useMemo(() => loadDateDetail(db, id), [id]);
  const { data: photos } = useLiveQuery(photosForDateQuery(db, id), [id]);
  const { data: detailRows } = useLiveQuery(dateDetailQuery(db, id), [id]);
  const coverPhotoId = detailRows[0]?.coverPhotoId ?? null;
  const [adding, setAdding] = useState(false);

  const [title, setTitle] = useState(detail?.title ?? '');
  const [caption, setCaption] = useState(detail?.caption ?? '');
  const [rating, setRating] = useState(detail?.rating ?? 0);

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink }}>That date no longer exists.</Text>
      </SafeAreaView>
    );
  }

  const addPhoto = async () => {
    if (adding) return;
    // Claim the flag BEFORE the first await, not after. Set later, a second tap
    // arriving while this call is suspended at the permission prompt would sail
    // past the guard and open a second picker — the guard would only be
    // protecting the synchronous write, which cannot be re-entered anyway.
    setAdding(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // Spec §10: a date without photos is fully valid. Never a dead end.
        Alert.alert('Photos unavailable', 'You can still title and publish this date.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;

      // Copy to durable storage first: the picker's uri can be a temporary
      // cache entry the OS reclaims. A row pointing at a reclaimed file is a
      // permanently broken image with no way to notice it happened.
      const durable = persistPickedImage(asset.uri, `${deps.newId()}.jpg`);
      attachPhoto(db, deps, {
        dateId: id, localUri: durable, width: asset.width, height: asset.height,
      });
    } catch {
      Alert.alert('Could not add that photo', 'Something went wrong saving it to your device.');
    } finally {
      setAdding(false);
    }
  };

  // setCoverPhoto validates that the photo still belongs to this date and
  // throws if not — a stale list racing a delete. An unhandled throw inside
  // an onPress is a redbox in development and a silent no-op in production,
  // neither of which tells the user anything, so it is caught here instead.
  const chooseCover = (photoId: string | null) => {
    try {
      setCoverPhoto(db, deps, id, photoId);
    } catch {
      Alert.alert('Could not set cover', 'That photo is no longer part of this date.');
    }
  };

  const save = (publish: boolean) => {
    updateDateDetails(db, deps, id, { title: title.trim(), caption, rating: rating === 0 ? null : rating });
    if (publish) {
      try {
        publishDate(db, deps, id);
      } catch {
        Alert.alert('Almost there', 'Give this date a title first.');
        return;
      }
    }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream }}>
      <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted }}>
          {detail.occurredOn.toUpperCase()}
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Name this date"
          placeholderTextColor={theme.color.muted}
          // The receipt shrinks and then ellipsises an over-wide title, and
          // the exported filename is built from it. Cap it here so neither has
          // to rescue an essay.
          maxLength={60}
          style={{ fontSize: 24, fontWeight: '700', color: theme.color.ink, paddingVertical: theme.space.sm }}
        />

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="How was it?"
          placeholderTextColor={theme.color.muted}
          multiline
          style={{ minHeight: 90, fontSize: 16, color: theme.color.ink, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md, padding: theme.space.md, borderWidth: 1, borderColor: theme.color.line }}
        />

        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n === rating ? 0 : n)}>
              <Text style={{ fontSize: 30 }}>{n <= rating ? '♥' : '♡'}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 11, letterSpacing: 1, color: theme.color.muted, marginTop: theme.space.md }}>
          PHOTOS
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingVertical: theme.space.sm }}>
          {photos.map((photo) => {
            const isCover = photo.id === coverPhotoId;
            return (
              <Pressable
                key={photo.id}
                onPress={() => chooseCover(isCover ? null : photo.id)}
                onLongPress={() =>
                  Alert.alert('Remove this photo?', 'It disappears from this date.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => detachPhoto(db, deps, photo.id) },
                  ])
                }
                style={{
                  width: 84, height: 105, borderRadius: theme.radius.md, overflow: 'hidden',
                  borderWidth: isCover ? 3 : 1,
                  borderColor: isCover ? theme.color.rose : theme.color.line,
                }}
              >
                {photo.localUri !== null && (
                  <Image source={{ uri: photo.localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                )}
              </Pressable>
            );
          })}

          <Pressable
            onPress={addPhoto}
            disabled={adding}
            style={{
              width: 84, height: 105, borderRadius: theme.radius.md,
              borderWidth: 1, borderColor: theme.color.line, borderStyle: 'dashed',
              alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.blush,
              opacity: adding ? 0.4 : 1,
            }}
          >
            <Text style={{ fontSize: 24, color: theme.color.muted }}>+</Text>
          </Pressable>
        </ScrollView>
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>
          Tap to set the cover · hold to remove
        </Text>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md }}>
        <Pressable
          onPress={() => save(false)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.blush }}
        >
          <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Save draft</Text>
        </Pressable>
        <Pressable
          onPress={() => save(true)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space.md, borderRadius: theme.radius.md, backgroundColor: theme.color.ink }}
        >
          <Text style={{ color: theme.color.cream, fontWeight: '700' }}>Publish</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
