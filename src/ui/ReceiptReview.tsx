import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParsedReceipt, ReceiptItem } from '@/domain/receipts/parse';
import { formatMoney, money } from '@/domain/money/money';
import { Card } from './Card';
import { MicroLabel } from './MicroLabel';
import { theme } from './theme';
import { useTheme } from './ThemeProvider';
import { tap } from './feedback';

/**
 * What the camera made of a receipt, offered for confirmation.
 *
 * Everything here is a suggestion. OCR misreads, and a wrong amount written
 * straight into the ledger is worse than no amount at all, so nothing this
 * shows is saved until it is tapped — the items start unselected and the total
 * has to be accepted before it reaches the keypad.
 */
export function ReceiptReview({
  receipt,
  currencyCode,
  selected,
  onToggleItem,
  onUseTotal,
}: {
  receipt: ParsedReceipt;
  currencyCode: string;
  selected: readonly number[];
  onToggleItem: (index: number) => void;
  onUseTotal: (amountMinor: number) => void;
}) {
  const t = useTheme();
  const show = (amountMinor: number) => formatMoney(money(amountMinor, currencyCode));
  // Bound once so the JSX below narrows properly. Reading receipt.totalMinor
  // inside the branch needs a cast, and a cast is how a null reaches formatMoney
  // unnoticed the day this branch is edited.
  const totalMinor = receipt.totalMinor;

  if (receipt.items.length === 0 && receipt.totalMinor === null) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
          <Ionicons name="scan-outline" size={18} color={t.role.inkMuted} />
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted, flex: 1 }}>
            Nothing readable on that photo. Type the amount instead — the photo is still attached.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: theme.space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.xs }}>
          <Ionicons name="receipt-outline" size={16} color={t.role.primary} />
          <MicroLabel>READ FROM RECEIPT</MicroLabel>
        </View>

        {receipt.items.map((item: ReceiptItem, index: number) => {
          const isOn = selected.includes(index);
          return (
            <Pressable
              key={`${item.label}-${index}`}
              onPress={() => { tap(); onToggleItem(index); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.sm,
                paddingVertical: theme.space.xs,
              }}
            >
              <Ionicons
                name={isOn ? 'checkbox' : 'square-outline'}
                size={20}
                color={isOn ? t.role.primary : t.role.inkMuted}
              />
              <Text
                numberOfLines={1}
                style={{ ...theme.type.body, color: isOn ? t.role.ink : t.role.inkMuted, flex: 1 }}
              >
                {item.label}
              </Text>
              <Text style={{ ...theme.type.body, color: isOn ? t.role.ink : t.role.inkMuted }}>
                {show(item.amountMinor)}
              </Text>
            </Pressable>
          );
        })}

        {totalMinor === null ? (
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted }}>
            No total found — tick the items you want or type the amount.
          </Text>
        ) : (
          <Pressable
            onPress={() => { tap(); onUseTotal(totalMinor); }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.sm,
              borderTopWidth: 1,
              borderTopColor: t.role.line,
              paddingTop: theme.space.sm,
            }}
          >
            <Ionicons name="arrow-up-circle" size={20} color={t.role.primary} />
            <Text style={{ ...theme.type.body, color: t.role.ink, flex: 1 }}>Use total</Text>
            <Text style={{ ...theme.type.title, color: t.role.primary }}>
              {show(totalMinor)}
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
