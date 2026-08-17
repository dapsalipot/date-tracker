import { View } from 'react-native';
import { theme } from './theme';

/** The hairline the whole direction is built on. */
export function Rule() {
  return <View style={{ height: 1, backgroundColor: theme.role.line }} />;
}
