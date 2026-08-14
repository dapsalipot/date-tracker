import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { migrationDb } from '@/db/client';
import { theme } from '@/ui/theme';

export default function RootLayout() {
  const { success, error } = useMigrations(migrationDb, migrations);

  if (error) {
    // A failed migration must never brick the app — surface it plainly.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.ink, fontWeight: '700' }}>Database update failed</Text>
        <Text style={{ color: theme.color.muted, marginTop: theme.space.sm }}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.color.muted }}>Preparing…</Text>
      </View>
    );
  }

  // Headers are ON by default so every pushed screen gets a back button. The
  // two screens that opt out both provide their own way back: the feed is the
  // root (nowhere to go), and capture is a modal with an explicit Cancel.
  // Without this, the only way out of a detail screen was the iOS edge-swipe —
  // undiscoverable, and absent entirely on Android.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.cream },
        headerTintColor: theme.color.ink,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.color.cream },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="date/[id]/index" options={{ title: 'Date' }} />
      <Stack.Screen name="date/[id]/compose" options={{ title: 'Compose' }} />
      <Stack.Screen name="date/[id]/share" options={{ title: 'Share' }} />
      <Stack.Screen name="date/[id]/stop/[stopId]" options={{ title: 'Edit stop' }} />
    </Stack>
  );
}
