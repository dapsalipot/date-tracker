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

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="capture" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
