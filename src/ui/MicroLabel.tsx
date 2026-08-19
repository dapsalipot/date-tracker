import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';

/** Uppercase, letterspaced, muted. Was reimplemented inline on six screens. */
export function MicroLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ ...theme.type.micro, color: t.role.inkMuted }}>{children}</Text>;
}
