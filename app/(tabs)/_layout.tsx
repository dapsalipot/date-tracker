import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';

/**
 * `headerShown: false` is safe here in a way it was not at the root Stack: a
 * tab screen is always reachable from the tab bar, so it can never become a
 * screen with no way out. Each screen draws its own heading anyway — the
 * feed its search bar and calendar, the dashboard its month stepper, memories
 * its per-section `MicroLabel`s.
 *
 * Filled glyph when focused, outline when not — `tabBarActiveTintColor`
 * already colours the active tab `role.primary`, so the shape change is what
 * carries the state at a glance rather than colour alone.
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.role.primary,
        tabBarInactiveTintColor: t.role.inkMuted,
        tabBarStyle: { backgroundColor: t.role.surface, borderTopColor: t.role.line },
        tabBarLabelStyle: { ...theme.type.micro },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dates',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Spending',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: 'Memories',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
