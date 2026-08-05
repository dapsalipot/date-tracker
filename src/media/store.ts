import { Directory, File, Paths } from 'expo-file-system';

const PHOTO_DIR_NAME = 'photos';

/**
 * Copies a picked image into the app's documents directory and returns its new
 * uri. The picker hands back a path in the OS cache directory, which the system
 * may reclaim at any time — a photo referenced straight from the picker can
 * silently vanish between sessions. The copy is what makes the reference durable.
 */
export function persistPickedImage(uri: string, fileName: string): string {
  const dir = new Directory(Paths.document, PHOTO_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }

  const target = new File(dir, fileName);
  new File(uri).copySync(target);
  return target.uri;
}
