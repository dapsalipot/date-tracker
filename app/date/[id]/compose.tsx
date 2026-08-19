import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { db } from '@/db/client';
import { dateDetailQuery, loadDateDetail, publishDate, updateDateDetails } from '@/domain/dates/compose';
import { setCoverPhoto } from '@/domain/dates/cover';
import { attachPhoto, detachPhoto, photosForDateQuery } from '@/domain/photos/repository';
import { persistPickedImage } from '@/media/store';
import { getAppDeps } from '@/session';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { MicroLabel } from '@/ui/MicroLabel';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';
import { commit } from '@/ui/feedback';

const PHOTO_WIDTH = 84;
const PHOTO_HEIGHT = 105;

export default function Compose() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deps = getAppDeps();
  const detail = useMemo(() => loadDateDetail(db, id), [id]);
  const { data: photos } = useLiveQuery(photosForDateQuery(db, id), [id]);
  const { data: detailRows } = useLiveQuery(dateDetailQuery(db, id), [id]);
  const coverPhotoId = detailRows[0]?.coverPhotoId ?? null;
  const [adding, setAdding] = useState(false);

  const [title, setTitle] = useState(detail?.title ?? '');

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.role.ground, justifyContent: 'center', padding: theme.space.lg }}>
        <Card>
          <Text style={{ ...theme.type.body, color: t.role.ink, textAlign: 'center' }}>
            That date no longer exists.
          </Text>
        </Card>
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
      commit();
    } catch {
      Alert.alert('Could not set cover', 'That photo is no longer part of this date.');
    }
  };

  const save = (publish: boolean) => {
    updateDateDetails(db, deps, id, { title: title.trim() });
    if (publish) {
      try {
        publishDate(db, deps, id);
        commit();
      } catch {
        Alert.alert('Almost there', 'Give this date a title first.');
        return;
      }
    }
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.role.ground }}>
      <ScrollView contentContainerStyle={{ padding: theme.space.md, gap: theme.space.md }}>
        <Card>
          <MicroLabel>{detail.occurredOn.toUpperCase()}</MicroLabel>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Name this date"
            placeholderTextColor={t.role.inkMuted}
            // The receipt shrinks and then ellipsises an over-wide title, and
            // the exported filename is built from it. Cap it here so neither has
            // to rescue an essay.
            maxLength={60}
            style={{ ...theme.type.title, color: t.role.ink, paddingVertical: theme.space.sm }}
          />
        </Card>

        <Card>
          <MicroLabel>PHOTOS</MicroLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.space.sm, marginTop: theme.space.sm }}
          >
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
                    width: PHOTO_WIDTH,
                    height: PHOTO_HEIGHT,
                    borderRadius: theme.radius.md,
                    overflow: 'hidden',
                    borderWidth: isCover ? 2 : 1,
                    borderColor: isCover ? t.role.primary : t.role.line,
                  }}
                >
                  {photo.localUri !== null && (
                    <Image source={{ uri: photo.localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  )}
                  {isCover && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: t.role.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="star" size={12} color={t.role.onPrimary} />
                    </View>
                  )}
                </Pressable>
              );
            })}

            {/*
              A plain bordered View, not a Card: Card now draws a hairline
              border and (in light mode) a lift shadow, and this tile sits
              inside the PHOTOS Card already — nesting one inside the other
              would draw a border and shadow within a border and shadow.
            */}
            <Pressable onPress={() => { void addPhoto(); }}>
              <View
                style={{
                  width: PHOTO_WIDTH,
                  height: PHOTO_HEIGHT,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: t.role.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: adding ? 0.4 : 1,
                }}
              >
                <Ionicons name="images-outline" size={24} color={t.role.inkMuted} />
              </View>
            </Pressable>
          </ScrollView>
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.sm }}>
            Tap to set the cover · hold to remove
          </Text>
        </Card>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: theme.space.sm, padding: theme.space.md }}>
        <View style={{ flex: 1 }}>
          <Button variant="quiet" label="Save draft" onPress={() => save(false)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Publish" onPress={() => save(true)} />
        </View>
      </View>
    </SafeAreaView>
  );
}
