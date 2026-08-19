/**
 * Reduces any stored `photos.local_uri` value to its basename. No expo import
 * on purpose — this is the piece that has to be a pure function of its input,
 * not an incidental one, so keep reading before "simplifying" it back into
 * `store.ts`.
 *
 * iOS regenerates the sandbox container UUID on every fresh install, so an
 * absolute `file://.../<UUID>/Documents/photos/<id>.jpg` written before a
 * reinstall dangles afterward even though the file itself was copied into the
 * new container under the same relative path. Because this function reduces
 * that legacy absolute path to the exact same basename a fresh row stores,
 * `photoUri()` (in `store.ts`) can resolve *any* stored value — old absolute
 * path or new bare filename — against the current documents directory and
 * get the right answer. Every row is self-healing on every future reinstall,
 * not just the one that prompted this fix.
 *
 * Do NOT add a migration to rewrite old rows to bare filenames. That would
 * "fix" today's data and change nothing structurally: the next reinstall
 * regenerates the container UUID again, and a migration only ever runs once.
 * This function is the actual, permanent fix; a migration would just be a
 * one-time patch sitting on top of a bug that's still there.
 */
export function photoFileName(stored: string): string {
  const lastSlash = stored.lastIndexOf('/');
  return lastSlash === -1 ? stored : stored.slice(lastSlash + 1);
}
