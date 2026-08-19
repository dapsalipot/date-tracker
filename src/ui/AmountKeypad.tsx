import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { currencySymbol, minorExponent } from '@/domain/money/money';
import { Card } from './Card';
import { tap } from './feedback';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';

const ALL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

/**
 * Cap on the integer part's digit count, applied regardless of currency.
 * Nothing stops a runaway string of taps otherwise. PHP dates in the tens of
 * thousands of pesos are normal (a resort weekend, a ring); 7 digits allows
 * up to 9,999,999 — two orders of magnitude above that — while still keeping
 * the amount a bounded, sane number.
 */
const MAX_INTEGER_DIGITS = 7;

interface Props {
  value: string;
  onChange: (next: string) => void;
  currencyCode: string;
  /**
   * Shown, muted, while `value` is empty. The stop editor starts empty to mean
   * "leave the amount alone", and without this the biggest thing on screen read
   * ₱0 for a ₱420 stop — which looks like the amount was wiped.
   */
  placeholder?: string;
}

/**
 * A custom keypad rather than a TextInput with a numeric keyboard: the system
 * keyboard animates in, can be dismissed, and on some devices offers a
 * non-numeric layout. The capture target is five seconds, and a keypad that is
 * simply already on screen removes that whole class of delay.
 */
export function AmountKeypad({ value, onChange, currencyCode, placeholder }: Props) {
  const t = useTheme();
  // money.ts owns both facts (MINOR_EXPONENTS, SYMBOLS). Reading them here
  // instead of hardcoding "two decimals" and a PHP-only symbol is what stops
  // the keypad from accepting precision (e.g. "420.50" for JPY) that
  // parseMajorToMinor then rejects with no explanation.
  const exponent = minorExponent(currencyCode);
  const keys = exponent === 0 ? ALL_KEYS.filter((key) => key !== '.') : ALL_KEYS;

  const press = (key: string) => {
    tap();
    if (key === '⌫') return onChange(value.slice(0, -1));

    const [whole, fraction] = value.split('.');

    if (key === '.') {
      // Zero-exponent currencies (JPY, KRW) have no fractional unit at all —
      // the key is already filtered out of `keys`, but guard here too in
      // case press() is ever called from something other than a key render.
      if (exponent === 0 || fraction !== undefined) return;
      return onChange(value + key);
    }

    if (fraction !== undefined) {
      if (fraction.length >= exponent) return;
    } else if ((whole ?? '').length >= MAX_INTEGER_DIGITS) {
      return;
    }

    onChange(value + key);
  };

  const symbol = currencySymbol(currencyCode);
  const showingPlaceholder = value === '' && placeholder !== undefined;

  return (
    <Card>
      {/*
        The one deliberate oversize: this is the screen's hero number, and the
        five-step type scale tops out at `display` (34), too small to carry a
        keypad readout. Every other size on this component is a theme token.
      */}
      <Text
        style={{
          fontSize: 44,
          fontWeight: '800',
          textAlign: 'center',
          paddingVertical: theme.space.md,
          color: showingPlaceholder ? t.role.inkMuted : t.role.primary,
        }}
      >
        {showingPlaceholder ? placeholder : `${symbol}${value === '' ? '0' : value}`}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {keys.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            style={{ width: '33.33%', paddingVertical: theme.space.md, alignItems: 'center' }}
          >
            {key === '⌫' ? (
              <Ionicons name="backspace-outline" size={22} color={t.role.ink} />
            ) : (
              <Text style={{ ...theme.type.title, fontWeight: '600', color: t.role.ink }}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
