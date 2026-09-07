import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import * as SplashScreen from 'expo-splash-screen';
import migrations from '../drizzle/migrations';
import { migrationDb } from '@/db/client';
import { Card } from '@/ui/Card';
import type { RegisteredFont } from '@/ui/fonts';
import { theme } from '@/ui/theme';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';

// Keyed by `RegisteredFont`, not a bare object: adding or renaming a weight
// here without updating fonts.ts's `REGISTERED_FONTS` (or vice versa) is a
// missing/excess-property error, not a silent mismatch with theme.ts's
// tokens.
const FONT_ASSETS: Record<RegisteredFont, number> = {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
};

void SplashScreen.preventAutoHideAsync();

/**
 * Everything ThemeProvider wraps, including the migration gate itself.
 * readSetting() (called by ThemeProvider on mount) now tolerates the
 * app_settings table not existing yet, so there is no ordering hazard in
 * mounting the provider before migrations resolve — see
 * domain/settings/settings.ts. Keeping the gate inside the provider (rather
 * than routing around it, as an earlier version of this file did) means the
 * loading and error screens are themed too, instead of flashing light on a
 * dark-themed device every cold start.
 */
function AppGate() {
  const t = useTheme();
  const { success, error } = useMigrations(migrationDb, migrations);

  if (error) {
    // A failed migration must never brick the app — surface it plainly.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg, backgroundColor: t.role.ground }}>
        <Card>
          <Text style={{ ...theme.type.body, fontFamily: theme.type.micro.fontFamily, color: t.role.ink }}>Database update failed</Text>
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.sm }}>{error.message}</Text>
        </Card>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: t.role.ground }}>
        <Card>
          <Text style={{ ...theme.type.body, color: t.role.inkMuted }}>Preparing…</Text>
        </Card>
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
        headerStyle: { backgroundColor: t.role.surface },
        headerTintColor: t.role.ink,
        headerTitleStyle: { fontFamily: theme.type.micro.fontFamily },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.role.ground },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="date/[id]/index" options={{ title: 'Date' }} />
      <Stack.Screen name="date/[id]/compose" options={{ title: 'Compose' }} />
      <Stack.Screen name="date/[id]/share" options={{ title: 'Share' }} />
      <Stack.Screen name="date/[id]/stop/[stopId]" options={{ title: 'Edit stop' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  // Settled, not loaded. Holding the splash until the font resolves avoids a
  // flash of system font reflowing into Nunito, which is more jarring than a
  // slightly longer splash — but the earlier version of this gate discarded
  // `useFonts`'s error, so a font that failed to load left `fontsLoaded` false
  // forever: the splash never hid, nothing ever rendered, and there was no
  // error anywhere to say why. A page in the system face is bad; an app that
  // never paints is worse, and it cannot be recovered from by the user.
  const fontsSettled = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontsSettled) void SplashScreen.hideAsync();
  }, [fontsSettled]);

  // Nothing has mounted yet (still covered by the native splash screen), so
  // this isn't an unthemed branch — it's the same "nothing rendered" moment
  // that existed before first paint anyway. ThemeProvider keeps wrapping the
  // whole tree, migration gate included, once we get past this point.
  if (!fontsSettled) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppGate />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
