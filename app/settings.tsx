import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/db/client';
import { getAppDeps, getLocalContext } from '@/session';
import { budgetStatusFor, setBudget } from '@/domain/budget/status';
import { listPeople, renamePerson } from '@/domain/identity/people';
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
 * The settings that had nowhere to live.
 *
 * `setBudget` and `renamePerson` were both written, tested, and called by
 * nothing but the seed fixture — so every budget figure the app displayed came
 * from seeded data, and a person's name, typed once into the payer picker, was
 * permanent. The theme toggle moved here from the Spending header, because a
 * colour scheme is a setting rather than a chart control.
 *
 * Section headings sit on the ground and the cards below them hold only
 * content — the same shape as the feed's month headings. A card never contains
 * another card, which is why the keypad (a Card in its own right) is not
 * wrapped in one here.
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
  const [people, setPeople] = useState(() => listPeople(db, ctx.coupleId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  // Safe on every string the keypad can produce — nextAmount guarantees a
  // digit is present, which is what parseMajorToMinor requires.
  const parsedMinor =
    amount === '' ? 0 : parseMajorToMinor(amount, ctx.currencyCode).amountMinor;

  const save = () => {
    setBudget(db, ctx.coupleId, periodMonth, parsedMinor, deps);
    router.back();
  };

  const commitRename = () => {
    if (editingId === null) return;
    try {
      renamePerson(db, deps, editingId, draftName);
    } catch {
      // The domain rejects a name that is blank once trimmed. Keep the field
      // open with the text intact rather than closing and losing the edit.
      return;
    }
    setPeople(listPeople(db, ctx.coupleId));
    setEditingId(null);
  };

  const sectionNote = { ...theme.type.meta, color: t.role.inkMuted } as const;

  return (
    <Screen scroll>
      <View style={{ gap: theme.space.lg, paddingTop: theme.space.md }}>
        <View style={{ gap: theme.space.sm }}>
          <MicroLabel>MONTHLY BUDGET</MicroLabel>
          <Text style={sectionNote}>
            {current === null
              ? 'Not set yet. What you set here carries into every later month until you change it.'
              : `Now ${formatMoney(money(current, ctx.currencyCode))}, carried forward each month.`}
          </Text>
          <AmountKeypad
            value={amount}
            onChange={setAmount}
            currencyCode={ctx.currencyCode}
            placeholder={
              current === null ? undefined : minorToMajorString(current, ctx.currencyCode)
            }
          />
          {/* Zero is a real number the keypad can produce and a meaningless
              budget — every date would open over budget on capture. */}
          <Button label="Save budget" onPress={save} disabled={parsedMinor === 0} />
        </View>

        <View style={{ gap: theme.space.sm }}>
          <MicroLabel>PEOPLE</MicroLabel>
          <Text style={sectionNote}>Tap a name to fix it. These are who the payer picker offers.</Text>
          <Card>
            {people.map((person, index) => (
              <View
                key={person.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.sm,
                  paddingVertical: theme.space.xs,
                  // A rule between rows, never above the first — the card's own
                  // edge already separates it from the heading.
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: t.role.line,
                  marginTop: index === 0 ? 0 : theme.space.sm,
                  paddingTop: index === 0 ? 0 : theme.space.sm,
                }}
              >
                {person.id === editingId ? (
                  <>
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      autoFocus
                      maxLength={40}
                      returnKeyType="done"
                      onSubmitEditing={commitRename}
                      style={{
                        ...theme.type.body,
                        color: t.role.ink,
                        flex: 1,
                        paddingVertical: theme.space.xs,
                        borderBottomWidth: 1,
                        borderBottomColor: t.role.line,
                      }}
                    />
                    <Pressable onPress={() => { tap(); commitRename(); }} hitSlop={8}>
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={draftName.trim() === '' ? t.role.line : t.role.primary}
                      />
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => {
                      tap();
                      setDraftName(person.displayName);
                      setEditingId(person.id);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: theme.space.sm }}
                  >
                    <Text style={{ ...theme.type.body, color: t.role.ink, flex: 1 }}>
                      {person.displayName}
                    </Text>
                    <Ionicons name="pencil-outline" size={16} color={t.role.inkMuted} />
                  </Pressable>
                )}
              </View>
            ))}
          </Card>
        </View>

        <View style={{ gap: theme.space.sm }}>
          <MicroLabel>APPEARANCE</MicroLabel>
          <Card>
            <Pressable
              onPress={() => { tap(); toggleTheme(); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
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
      </View>
    </Screen>
  );
}
