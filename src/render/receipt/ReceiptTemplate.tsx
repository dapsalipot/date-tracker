import type { ReactElement } from 'react';
import { Canvas, Fill, Group, Line, Text as SkText, matchFont } from '@shopify/react-native-skia';
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

const TITLE_MIN_SIZE = 40;
const TITLE_SHRINK_STEP = 4;

/**
 * Shrinks a title until it fits, then ellipsises if it still does not. The
 * compose screen caps title length, but a wide title at 72px can still overrun
 * 920px of usable width — and an un-measured SkText simply runs off the canvas
 * edge with no warning, taking the rest of the word with it.
 */
function fitTitle(text: string, maxWidth: number): { text: string; font: ReturnType<typeof skiaFont> } {
  let size = TITLE_SIZE;
  let font = skiaFont(size, 'bold');
  while (size > TITLE_MIN_SIZE && font.measureText(text).width > maxWidth) {
    size -= TITLE_SHRINK_STEP;
    font = skiaFont(size, 'bold');
  }
  if (font.measureText(text).width <= maxWidth) return { text, font };

  // Slice by code point, not code unit — cutting a surrogate pair in half
  // renders as tofu, and emoji in titles are expected here.
  const points = Array.from(text);
  let kept = points.length;
  while (kept > 1 && font.measureText(`${points.slice(0, kept).join('')}…`).width > maxWidth) {
    kept -= 1;
  }
  return { text: `${points.slice(0, kept).join('')}…`, font };
}

/** Vertical advance a line row consumes, which depends on whether it has a detail line. */
function rowHeightOf(hasDetail: boolean): number {
  return hasDetail ? DETAIL_OFFSET + AFTER_DETAIL_GAP : LINE_ROW_GAP;
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
  const title = fitTitle(vm.title, right - left);
  children.push(<SkText key="title" x={left} y={y} text={title.text} font={title.font} color={theme.color.ink} />);

  y += DATE_SIZE + 44;
  children.push(<SkText key="date" x={left} y={y} text={vm.occurredOn} font={fonts.date} color={theme.color.muted} />);

  y += SECTION_GAP;
  children.push(divider('divider-lines', y, left, right));
  y += SECTION_GAP;

  // A solo "paid by" line with no amount is noise, not information — skip it.
  const showPeople = vm.people.length > 0 && !(vm.people.length === 1 && vm.people.every((p) => p.money === null));
  const showTotal = vm.total !== null;
  const showRating = vm.rating !== null;
  const hasFooter = showPeople || showTotal || showRating;

  // Reserve the footer's height BEFORE laying out lines. Without this the rows
  // simply kept accumulating and the root Group clipped whatever fell past the
  // bottom edge — so a long date silently exported a receipt with no total on
  // it, which is precisely the number the reader is looking for.
  let footerHeight = hasFooter ? SECTION_GAP : 0; // the divider above it
  if (showPeople) footerHeight += CAPTION_GAP + vm.people.length * PERSON_ROW_GAP + (SECTION_GAP - PERSON_ROW_GAP);
  if (showTotal) footerHeight += SECTION_GAP + TOTAL_SIZE * 0.4;
  if (showRating) footerHeight += HEART_SIZE;

  const linesBottom = height - PADDING - footerHeight;

  // How many rows fit, leaving room for a "+N more" row if we have to truncate.
  let fitCount = 0;
  let used = 0;
  for (const line of vm.lines) {
    const next = used + rowHeightOf(line.detail !== null);
    const isLast = fitCount === vm.lines.length - 1;
    const reserve = isLast ? 0 : LINE_ROW_GAP; // room for the overflow row
    if (y + next + reserve > linesBottom) break;
    used = next;
    fitCount += 1;
  }

  const shown = vm.lines.slice(0, fitCount);
  const hiddenCount = vm.lines.length - fitCount;

  shown.forEach((line, i) => {
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

  if (hiddenCount > 0) {
    // Say so rather than just stopping. A receipt that quietly omits stops is
    // worse than one that admits it ran out of room.
    children.push(
      <SkText
        key="overflow"
        x={left}
        y={y}
        text={hiddenCount === 1 ? '+1 more stop' : `+${hiddenCount} more stops`}
        font={fonts.detail}
        color={theme.color.muted}
      />,
    );
    y += LINE_ROW_GAP;
  }

  // Only draw the closing rule when something follows it, otherwise tier and
  // hidden mode with a solo payer leave a rule hanging under nothing.
  if (hasFooter) {
    children.push(divider('divider-people', y, left, right));
    y += SECTION_GAP;
  }

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

/**
 * Mounts `ReceiptTemplate` inside a live Skia `<Canvas>` at its true pixel
 * size, so the share screen's preview is the exact component tree
 * `export.ts` rasterizes — not a separate RN mock that could drift from it
 * (spec §7.4: "a separate component tree ... not a screenshot"). This keeps
 * Skia awareness inside this file, honouring boundary rule 3 (spec §6):
 * everything outside `src/render/receipt/` asks for a shareable image and
 * never learns Skia was involved. Callers that need to fit this on a phone
 * screen scale the returned view down with a CSS transform; this component
 * itself always renders at `RECEIPT_SIZES[size]`.
 */
export function ReceiptCanvas({ vm, size }: { vm: ReceiptViewModel; size: ReceiptSize }): ReactElement {
  const { width, height } = RECEIPT_SIZES[size];
  return (
    <Canvas style={{ width, height }}>
      <ReceiptTemplate vm={vm} size={size} />
    </Canvas>
  );
}
