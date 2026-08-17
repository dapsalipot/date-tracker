import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/ui/theme';

export default function Dashboard() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.cream, padding: theme.space.md }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: theme.color.ink }}>Spending</Text>
    </SafeAreaView>
  );
}
