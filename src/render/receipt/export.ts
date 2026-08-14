import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ImageFormat, drawAsImage } from '@shopify/react-native-skia';
import type { ReceiptViewModel } from '@/domain/export/receipt';
import { RECEIPT_SIZES, ReceiptTemplate, type ReceiptSize } from './ReceiptTemplate';

/**
 * This module and `ReceiptTemplate.tsx` are the only two files in the
 * codebase allowed to import `@shopify/react-native-skia` (spec §6, boundary
 * rule 3). `shareReceipt` is the only export surface the rest of the app
 * calls — screens ask for "a shareable image of this date" and never learn
 * Skia was involved.
 */

/**
 * Filename-safe slug of a date title, e.g. "Tagaytay Getaway!" -> "tagaytay-getaway".
 * Falls back to a stable placeholder when the title has no alphanumerics
 * left after stripping (all-emoji titles, pure punctuation, empty string).
 */
const COMBINING_DIACRITIC_START = 0x0300;
const COMBINING_DIACRITIC_END = 0x036f;

function slugify(value: string): string {
  const withoutDiacritics = Array.from(value.normalize('NFKD'))
    .filter((ch) => {
      const codePoint = ch.codePointAt(0) ?? 0;
      return codePoint < COMBINING_DIACRITIC_START || codePoint > COMBINING_DIACRITIC_END;
    })
    .join('');

  const slug = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'date';
}

/**
 * Renders `vm` to a PNG at `size` and hands it to the OS share sheet.
 *
 * Errors (sharing unavailable, render failure) are thrown, not swallowed —
 * this function has no UI of its own, so the caller decides what the user
 * sees. Swallowing here would leave a Share button that silently does
 * nothing.
 */
export async function shareReceipt(vm: ReceiptViewModel, size: ReceiptSize): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  const image = await drawAsImage(ReceiptTemplate({ vm, size }), RECEIPT_SIZES[size]);
  if (image === null) {
    throw new Error('Failed to render the receipt image.');
  }

  const bytes = image.encodeToBytes(ImageFormat.PNG);

  // Cache, not documents: this is a derived artifact and the OS reclaiming
  // it costs nothing. A stable, human-meaningful name — the title slugified
  // plus the size — becomes the filename in whatever app receives it.
  const fileName = `${slugify(vm.title)}-${size}.png`;
  const file = new File(Paths.cache, fileName);
  // Synchronous class API: create() and write() are the sync methods here
  // (their async counterparts are copy()/move(), not these). Overwrite
  // rather than fail or accumulate `-1`, `-2` copies from earlier shares.
  file.create({ overwrite: true });
  file.write(bytes);

  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
}
