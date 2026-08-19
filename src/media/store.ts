import { Directory, File, Paths } from 'expo-file-system';
import { photoFileName } from './photoFileName';

export { photoFileName };

const PHOTO_DIR_NAME = 'photos';

/**
 * Copies a picked image into the app's documents directory and returns its
 * file name (not the absolute uri — see `photoFileName` for why). The picker
 * hands back a path in the OS cache directory, which the system may reclaim
 * at any time — a photo referenced straight from the picker can silently
 * vanish between sessions. The copy is what makes the reference durable.
 */
export function persistPickedImage(uri: string, fileName: string): string {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }

  const target = new File(dir, fileName);
  new File(uri).copySync(target);
  return fileName;
}

/**
 * Resolves a stored value (bare filename, or a legacy absolute uri) to a uri
 * `Image` can load right now, against the *current* documents directory.
 * Thin on purpose: `photoFileName` does the actual resolution logic and is
 * kept expo-free for that reason; this just rebuilds a live uri from it.
 */
export function photoUri(stored: string): string {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  return new File(dir, photoFileName(stored)).uri;
}
