import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { budgetStatusFor, setBudget } from '@/domain/budget/status';
import { formatMoney, minorToMajorString, money, parseMajorToMinor } from '@/domain/money/money';
import { AmountKeypad } from '@/ui/AmountKeypad';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { MicroLabel } from '@/ui/MicroLabel';
import { Screen } from '@/ui/Screen';
import { theme } from '@/ui/theme';
import { useTheme, useThemeToggle } from '@/ui/ThemeProvider';
import { tap } from '@/ui/feedback';

/**
 * The two settings that had nowhere to live.
 *
 * `setBudget` existed, was tested, and had exactly one caller — the seed
 * fixture. Every budget figure the app displayed came from seeded data, so a
 * real user's dashboard bar and capture sheet showed "no budget set" forever.
 * That is what this screen is for; the theme toggle moved here from the
 * Spending header because a colour scheme is a setting, not a chart control.
 */
export default function Settings() {
  const t = useTheme();
  const toggleTheme = useThemeToggle();
  const ctx = getLocalContext();
  const deps = getAppDeps();
  const today = deps.clock.todayLocal();
  const periodMonth = today.slice(0, 7);

  // Read once on mount rather than live: this screen is the only thing that
  // writes a budget, and it navigates away immediately after saving.
  const [current] = useState(() => budgetStatusFor(db, ctx, periodMonth, today).budgetMinor);
  const [amount, setAmount] = useState('');

  const parsedMinor =
    amount === '' ? 0 : parseMajorToMinor(amount, ctx.currencyCode).amountMinor;

  const save = () => {
    setBudget(db, ctx.coupleId, periodMonth, parsedMinor, deps);
    router.back();
  };

  return (
    <Screen scroll>
      <View style={{ gap: theme.space.lg, paddingTop: theme.space.md }}>
        <Card>
          <MicroLabel>MONTHLY BUDGET</MicroLabel>
          <Text style={{ ...theme.type.meta, color: t.role.inkMuted, marginTop: theme.space.xs }}>
            {current === null
              ? 'Not set yet. What you set here carries into every later month until you change it.'
              : `Now ${formatMoney(money(current, ctx.currencyCode))}, carried forward each month.`}
          </Text>
          <View style={{ marginTop: theme.space.md }}>
            <AmountKeypad
              value={amount}
              onChange={setAmount}
              currencyCode={ctx.currencyCode}
              placeholder={
                current === null ? undefined : minorToMajorString(current, ctx.currencyCode)
              }
            />
          </View>
          <View style={{ marginTop: theme.space.md }}>
            {/* Zero is a real number the keypad can produce and a meaningless
                budget — every date would open over budget on capture. */}
            <Button label="Save budget" onPress={save} disabled={parsedMinor === 0} />
          </View>
        </Card>

        <Card>
          <MicroLabel>APPEARANCE</MicroLabel>
          <Pressable
            onPress={() => { tap(); toggleTheme(); }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: theme.space.sm,
              paddingVertical: theme.space.xs,
            }}
          >
            <Text style={{ ...theme.type.body, color: t.role.ink }}>
              {t.name === 'light' ? 'Light' : 'Dark'}
            </Text>
            <Ionicons
              name={t.name === 'light' ? 'moon-outline' : 'sunny-outline'}
              size={20}
              color={t.role.primary}
            />
          </Pressable>
        </Card>
      </View>
    </Screen>
  );
}
