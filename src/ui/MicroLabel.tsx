import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { theme } from './theme';

/** Uppercase, letterspaced, muted. Was reimplemented inline on six screens. */
export function MicroLabel({ children }: { children: ReactNode }) {
  return <Text style={{ ...theme.type.micro, color: theme.role.inkMuted }}>{children}</Text>;
}
