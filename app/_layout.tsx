import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { migrationDb } from '@/db/client';
import { theme } from '@/ui/theme';
import { lightTheme } from '@/ui/themes';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';

/**
 * Owns the navigator's theme-dependent chrome. Split out from RootLayout
 * because it must render *inside* ThemeProvider to call useTheme(), while
 * ThemeProvider itself must render *outside* the migration gate below (see
 * RootLayout) — a single component can't satisfy both.
 */
function RootNavigator() {
  const t = useTheme();

  // Headers are ON by default so every pushed screen gets a back button. The
  // two screens that opt out both provide their own way back: the feed is the
  // root (nowhere to go), and capture is a modal with an explicit Cancel.
  // Without this, the only way out of a detail screen was the iOS edge-swipe —
  // undiscoverable, and absent entirely on Android.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.role.surface },
        headerTintColor: t.role.ink,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.role.ground },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="date/[id]/index" options={{ title: 'Date' }} />
      <Stack.Screen name="date/[id]/compose" options={{ title: 'Compose' }} />
      <Stack.Screen name="date/[id]/share" options={{ title: 'Share' }} />
      <Stack.Screen name="date/[id]/stop/[stopId]" options={{ title: 'Edit stop' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { success, error } = useMigrations(migrationDb, migrations);

  // These two branches render before migrations have finished, so the
  // `app_settings` table ThemeProvider reads on mount may not exist yet.
  // ThemeProvider (and useTheme()) must not wrap them — hardcode the light
  // theme's role tokens instead of going through context.
  if (error) {
    // A failed migration must never brick the app — surface it plainly.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg, backgroundColor: lightTheme.role.ground }}>
        <View style={{ backgroundColor: lightTheme.role.surface, borderRadius: theme.radius.lg, padding: theme.space.md }}>
          <Text style={{ ...theme.type.body, fontWeight: '700', color: lightTheme.role.ink }}>Database update failed</Text>
          <Text style={{ ...theme.type.meta, color: lightTheme.role.inkMuted, marginTop: theme.space.sm }}>{error.message}</Text>
        </View>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: lightTheme.role.ground }}>
        <View style={{ backgroundColor: lightTheme.role.surface, borderRadius: theme.radius.lg, padding: theme.space.md }}>
          <Text style={{ ...theme.type.body, color: lightTheme.role.inkMuted }}>Preparing…</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
