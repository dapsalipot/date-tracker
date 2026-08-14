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
const SLUG_MAX_LENGTH = 60;
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
    .replace(/^-+|-+$/g, '')
    // A filename component must stay under 255 bytes or create() throws, and
    // the failure would surface only as the share screen's generic alert.
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
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

  let bytes: Uint8Array;
  try {
    bytes = image.encodeToBytes(ImageFormat.PNG);
  } finally {
    // A 1080x1920 surface is a native allocation the JS GC does not hurry to
    // reclaim. Spec §10 names low-memory Skia export as a real failure mode,
    // and holding several of these across repeated exports is how you get
    // there. Released as soon as the bytes are out.
    image.dispose();
  }

  // Cache, not documents: this is a derived artifact and the OS reclaiming
  // it costs nothing. A stable, human-meaningful name — the title slugified
  // plus the size — becomes the filename in whatever app receives it.
  const fileName = `${slugify(vm.title)}-${size}.png`;
  const file = new File(Paths.cache, fileName);
  // Synchronous class API: create() and write() are the sync methods here
  // (their async counterparts are copy()/move(), not these). Overwrite
  // rather than fail or accumulate `-1`, `-2` copies from earlier shares.
  file.create({ overwrite: true });
  try {
    file.write(bytes);
  } catch (err) {
    // create() truncates before write(), so a failure here (spec §10: device
    // storage full) would otherwise leave a 0-byte PNG in cache for the share
    // sheet — or a later run — to pick up.
    try {
      file.delete();
    } catch {
      // Nothing more to do; the original failure is the one worth reporting.
    }
    throw err;
  }

  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
}
