import { View } from 'react-native';
import { useTheme } from './ThemeProvider';

/** The hairline the whole direction is built on. */
export function Rule() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.role.line }} />;
}
