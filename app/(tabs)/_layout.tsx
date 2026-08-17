import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { theme } from '@/ui/theme';

/**
 * `headerShown: false` is safe here in a way it was not at the root Stack: a
 * tab screen is always reachable from the tab bar, so it can never become a
 * screen with no way out. Both screens draw their own heading anyway — the
 * feed its "Our dates" title, the dashboard its month stepper.
 *
 * Text icons rather than an icon package: two glyphs do not justify a
 * dependency.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.rose,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: { backgroundColor: theme.color.cream, borderTopColor: theme.color.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dates',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>♥</Text>,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Spending',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>▤</Text>,
        }}
      />
    </Tabs>
  );
}
