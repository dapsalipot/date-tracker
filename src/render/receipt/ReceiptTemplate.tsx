import type { ReactElement } from 'react';
import { Fill, Group, Line, Text as SkText, matchFont } from '@shopify/react-native-skia';
import type { ReceiptViewModel } from '@/domain/export/receipt';
import { theme } from '@/ui/theme';

/**
 * This module and `export.ts` are the only two files in the codebase allowed
 * to import `@shopify/react-native-skia` (spec §6, boundary rule 3). Every
 * other screen asks for "a shareable image of this date" and gets a file URI.
 */

export const RECEIPT_SIZES = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;

export type ReceiptSize = keyof typeof RECEIPT_SIZES;

// Absolute pixel values for a 1080-wide export canvas. `theme.space` is tuned
// for a ~390pt phone screen and would be illegibly small at this size.
const PADDING = 80;
const TITLE_SIZE = 72;
const DATE_SIZE = 32;
const LABEL_SIZE = 40;
const DETAIL_SIZE = 28;
const CAPTION_SIZE = 26;
const TOTAL_SIZE = 56;
const PERSON_SIZE = 36;
const HEART_SIZE = 44;

const LINE_ROW_GAP = 64; // baseline-to-baseline for a line with no detail
const DETAIL_OFFSET = 40; // label baseline -> detail baseline
const AFTER_DETAIL_GAP = 44; // detail baseline -> next row baseline
const PERSON_ROW_GAP = 52;
const SECTION_GAP = 56;
const CAPTION_GAP = 44; // caption baseline -> first row baseline
const DIVIDER_WEIGHT = 2;
const HEART_ADVANCE = 60;

const RATING_SCALE = 5;
const FILLED_MARK = '♥'; // ♥
const EMPTY_MARK = '♡'; // ♡

function skiaFont(fontSize: number, fontWeight: 'normal' | '600' | 'bold' = 'normal') {
  return matchFont({ fontFamily: 'System', fontSize, fontWeight });
}

interface Fonts {
  title: ReturnType<typeof skiaFont>;
  date: ReturnType<typeof skiaFont>;
  label: ReturnType<typeof skiaFont>;
  detail: ReturnType<typeof skiaFont>;
  caption: ReturnType<typeof skiaFont>;
  person: ReturnType<typeof skiaFont>;
  total: ReturnType<typeof skiaFont>;
  heart: ReturnType<typeof skiaFont>;
}

function divider(key: string, y: number, left: number, right: number): ReactElement {
  return (
    <Line
      key={key}
      p1={{ x: left, y }}
      p2={{ x: right, y }}
      color={theme.color.line}
      strokeWidth={DIVIDER_WEIGHT}
    />
  );
}

function rightAlignedText(
  key: string,
  text: string,
  rightEdge: number,
  y: number,
  font: ReturnType<typeof skiaFont>,
  color: string,
): ReactElement {
  const width = font.measureText(text).width;
  return <SkText key={key} x={rightEdge - width} y={y} text={text} font={font} color={color} />;
}

/**
 * Renders `vm` — every string this shows comes from `ReceiptViewModel`. The
 * template never formats a number, builds a currency string, or sums
 * anything; if a needed string isn't on the view model, that's a Task 2 gap.
 */
export function ReceiptTemplate({ vm, size }: { vm: ReceiptViewModel; size: ReceiptSize }): ReactElement {
  const { width, height } = RECEIPT_SIZES[size];
  const left = PADDING;
  const right = width - PADDING;

  const fonts: Fonts = {
    title: skiaFont(TITLE_SIZE, 'bold'),
    date: skiaFont(DATE_SIZE),
    label: skiaFont(LABEL_SIZE, '600'),
    detail: skiaFont(DETAIL_SIZE),
    caption: skiaFont(CAPTION_SIZE, '600'),
    person: skiaFont(PERSON_SIZE),
    total: skiaFont(TOTAL_SIZE, 'bold'),
    heart: skiaFont(HEART_SIZE),
  };

  const children: ReactElement[] = [
    <Fill key="background" color={theme.color.cream} />,
  ];

  let y = PADDING + TITLE_SIZE * 0.85;
  children.push(<SkText key="title" x={left} y={y} text={vm.title} font={fonts.title} color={theme.color.ink} />);

  y += DATE_SIZE + 44;
  children.push(<SkText key="date" x={left} y={y} text={vm.occurredOn} font={fonts.date} color={theme.color.muted} />);

  y += SECTION_GAP;
  children.push(divider('divider-lines', y, left, right));
  y += SECTION_GAP;

  vm.lines.forEach((line, i) => {
    children.push(
      <SkText key={`label-${i}`} x={left} y={y} text={line.label} font={fonts.label} color={theme.color.ink} />,
    );
    if (line.money !== null) {
      children.push(rightAlignedText(`money-${i}`, line.money, right, y, fonts.label, theme.color.ink));
    }
    if (line.detail !== null) {
      y += DETAIL_OFFSET;
      children.push(
        <SkText key={`detail-${i}`} x={left} y={y} text={line.detail} font={fonts.detail} color={theme.color.muted} />,
      );
      y += AFTER_DETAIL_GAP;
    } else {
      y += LINE_ROW_GAP;
    }
  });

  // A solo "paid by" line with no amount is noise, not information — skip it.
  const showPeople = vm.people.length > 0 && !(vm.people.length === 1 && vm.people.every((p) => p.money === null));

  children.push(divider('divider-people', y, left, right));
  y += SECTION_GAP;

  if (showPeople) {
    children.push(
      <SkText key="people-caption" x={left} y={y} text="PAID BY" font={fonts.caption} color={theme.color.muted} />,
    );
    y += CAPTION_GAP;
    vm.people.forEach((person, i) => {
      children.push(
        <SkText key={`person-${i}`} x={left} y={y} text={person.name} font={fonts.person} color={theme.color.ink} />,
      );
      if (person.money !== null) {
        children.push(rightAlignedText(`person-money-${i}`, person.money, right, y, fonts.person, theme.color.ink));
      }
      y += PERSON_ROW_GAP;
    });
    y += SECTION_GAP - PERSON_ROW_GAP;
  }

  if (vm.total !== null) {
    children.push(
      <SkText key="total-caption" x={left} y={y} text="TOTAL" font={fonts.caption} color={theme.color.muted} />,
    );
    children.push(rightAlignedText('total-amount', vm.total, right, y, fonts.total, theme.color.ink));
    y += SECTION_GAP + TOTAL_SIZE * 0.4;
  }

  if (vm.rating !== null) {
    for (let n = 1; n <= RATING_SCALE; n += 1) {
      const mark = n <= vm.rating ? FILLED_MARK : EMPTY_MARK;
      children.push(
        <SkText
          key={`rating-${n}`}
          x={left + (n - 1) * HEART_ADVANCE}
          y={y}
          text={mark}
          font={fonts.heart}
          color={theme.color.rose}
        />,
      );
    }
  }

  return (
    <Group clip={{ x: 0, y: 0, width, height }}>
      {children}
    </Group>
  );
}
