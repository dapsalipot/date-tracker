import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';

/**
 * Ground, safe area, and the one screen margin. Every screen hand-rolled this
 * with slightly different padding, which is why nothing lined up between them.
 */
export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: theme.screenMargin, paddingBottom: theme.space.xxl }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: theme.screenMargin }}>{children}</View>
  );

  return <SafeAreaView style={{ flex: 1, backgroundColor: t.role.ground }} edges={['top', 'left', 'right']}>{body}</SafeAreaView>;
}
