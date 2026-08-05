import { Pressable, Text, View } from 'react-native';
import { theme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

interface Props {
  value: string;
  onChange: (next: string) => void;
  currencyCode: string;
}

/**
 * A custom keypad rather than a TextInput with a numeric keyboard: the system
 * keyboard animates in, can be dismissed, and on some devices offers a
 * non-numeric layout. The capture target is five seconds, and a keypad that is
 * simply already on screen removes that whole class of delay.
 */
export function AmountKeypad({ value, onChange, currencyCode }: Props) {
  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1));
    if (key === '.' && value.includes('.')) return;
    // Two decimal places max — parseMajorToMinor rejects more precision.
    const [, fraction] = value.split('.');
    if (fraction !== undefined && fraction.length >= 2 && key !== '⌫') return;
    onChange(value + key);
  };

  const symbol = currencyCode === 'PHP' ? '₱' : `${currencyCode} `;

  return (
    <View>
      <Text style={{ fontSize: 44, fontWeight: '800', color: theme.color.ink, textAlign: 'center', paddingVertical: theme.space.md }}>
        {symbol}{value === '' ? '0' : value}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            style={{ width: '33.33%', paddingVertical: theme.space.md, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 26, color: theme.color.ink }}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
