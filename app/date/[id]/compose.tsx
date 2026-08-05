import { useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { db, appDeps } from '@/db/client';
import { loadDateDetail, publishDate, updateDateDetails } from '@/domain/dates/compose';
import { theme } from '@/ui/theme';

export default function Compose() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deps = useMemo(() => appDeps('Asia/Manila'), []);
  const detail = useMemo(() => loadDateDetail(db, id), [id]);

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
