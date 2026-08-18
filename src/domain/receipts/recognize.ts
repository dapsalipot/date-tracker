import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseReceipt, type ParsedReceipt } from './parse';
import { toRows, type TextFragment } from './rows';

/**
 * Reads a photographed receipt into candidate line items, entirely on-device.
 *
 * This file is the only part of receipt reading that touches a native module,
 * and it holds no logic of its own on purpose: it converts ML Kit's shape into
 * fragments, rebuilds rows, and parses. Everything worth getting right lives in
 * `rows.ts` and `parse.ts`, which run in plain Node and are tested there —
 * a native module cannot be exercised by the test suite, so nothing that can
 * be wrong should live here.
 */
export async function recognizeReceipt(
  imageUri: string,
  currencyCode: string,
): Promise<ParsedReceipt> {
  const result = await TextRecognition.recognize(imageUri);

  const fragments: TextFragment[] = [];
  for (const block of result.blocks) {
    for (const line of block.lines) {
      // A line without a frame cannot be placed on a row, and a receipt read
      // out of position is worse than one not read at all.
      if (line.frame === undefined) continue;
      fragments.push({
        text: line.text,
        top: line.frame.top,
        left: line.frame.left,
        height: line.frame.height,
      });
    }
  }

  return parseReceipt(toRows(fragments), currencyCode);
}
