import { describe, expect, it } from 'vitest';
// Imported from the pure module, not `./store` — `store.ts` pulls in
// expo-file-system at module scope, which transitively pulls in
// react-native, which vitest's plain-Node environment cannot parse (Flow
// syntax). `photoFileName` has no such import, by design.
import { photoFileName } from './photoFileName';

describe('photoFileName', () => {
  it('leaves a bare file name unchanged', () => {
    expect(photoFileName('abc.jpg')).toBe('abc.jpg');
  });

  it('takes the basename of a current-container absolute uri', () => {
    expect(
      photoFileName('file:///var/mobile/Containers/Data/Application/AAAA/Documents/photos/abc.jpg'),
    ).toBe('abc.jpg');
  });

  it('takes the basename of a legacy uri from a different container', () => {
    // This is the actual bug: the same photo, but the UUID changed on
    // reinstall. A correct implementation ignores everything before the
    // last slash, so this must resolve identically to the case above.
    expect(
      photoFileName('file:///var/mobile/Containers/Data/Application/BBBB/Documents/photos/abc.jpg'),
    ).toBe('abc.jpg');
  });

  it('takes the basename of a legacy path with no scheme', () => {
    expect(photoFileName('/var/mobile/Containers/Data/Application/AAAA/Documents/photos/abc.jpg')).toBe(
      'abc.jpg',
    );
  });

  it('discriminates against an identity implementation', () => {
    // A wrong implementation that just returns its input would pass every
    // "already a bare name" case above by accident. This is the case that
    // catches it.
    const withPath = 'file:///var/mobile/.../Documents/photos/abc.jpg';
    expect(photoFileName(withPath)).not.toBe(withPath);
  });

  it('splits on the last slash, not the first', () => {
    // A wrong implementation that splits on the first "/" instead of the
    // last would return "var" here, not the file name.
    expect(photoFileName('/a/b/c/abc.jpg')).toBe('abc.jpg');
  });
});
