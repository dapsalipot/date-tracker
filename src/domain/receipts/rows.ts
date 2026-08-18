/**
 * A single piece of text OCR found, with where it sat on the image.
 *
 * Deliberately narrower than ML Kit's own line type: this module needs only a
 * position and a string, and keeping it that way lets the row logic be tested
 * in plain Node with no native module and no photograph.
 */
export interface TextFragment {
  readonly text: string;
  readonly top: number;
  readonly left: number;
  readonly height: number;
}

/**
 * How far apart two fragments' vertical centres may sit and still count as one
 * row, as a share of text height.
 *
 * A photographed receipt is never square, so fragments in one row drift by a
 * few pixels and an exact match would split every row. Going the other way, a
 * tolerance of a full line height merges adjacent rows and every amount is lost
 * with its label. Six tenths of a line clears realistic skew without reaching
 * the next row.
 *
 * ponytail: a fixed fraction, not deskewing. If real photos at an angle
 * misgroup, rotate by the fitted baseline before grouping rather than widening
 * this.
 */
const ROW_TOLERANCE = 0.6;

/**
 * Rebuilds a receipt's visual rows from scattered OCR fragments.
 *
 * ML Kit reads a receipt in columns: the item names are one block and the
 * prices another, so "LATTE" and "180.00" arrive as separate fragments even
 * though they are one line of the bill. Fed straight to the parser, one has no
 * amount and the other no label, and both are dropped — the whole receipt reads
 * as empty. Grouping by vertical position puts them back together.
 */
export function toRows(fragments: readonly TextFragment[]): string[] {
  const usable = fragments.filter((f) => f.text.trim() !== '');
  if (usable.length === 0) return [];

  const centre = (f: TextFragment) => f.top + f.height / 2;

  const byRow: TextFragment[][] = [];

  for (const fragment of [...usable].sort((a, b) => centre(a) - centre(b))) {
    const row = byRow[byRow.length - 1];
    // Compare against the row's first fragment rather than its last: chaining
    // from each new member lets a column of near-misses walk down the page and
    // swallow the whole receipt into one row.
    const anchor = row === undefined ? undefined : row[0];

    if (
      row !== undefined &&
      anchor !== undefined &&
      Math.abs(centre(fragment) - centre(anchor)) <= Math.max(anchor.height, fragment.height) * ROW_TOLERANCE
    ) {
      row.push(fragment);
    } else {
      byRow.push([fragment]);
    }
  }

  return byRow.map((row) =>
    [...row]
      .sort((a, b) => a.left - b.left)
      .map((f) => f.text.trim())
      .join(' '),
  );
}
