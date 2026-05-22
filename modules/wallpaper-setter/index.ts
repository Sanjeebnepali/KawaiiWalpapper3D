import { requireOptionalNativeModule } from 'expo';

/**
 * Local Expo module that exposes `WallpaperManager.setBitmap` directly,
 * so the user can apply a wallpaper in one tap without going through the
 * system "Set as Wallpaper" picker (which on many OEM skins is a crop
 * editor that demands re-selecting the image — the bug the user reported).
 *
 * Android-only. `requireOptionalNativeModule` returns `null` on iOS so
 * call sites can fall back to the existing `photos-redirect://` deep-link.
 */
type WallpaperTarget = 'home' | 'lock' | 'both';

type WallpaperSetterModule = {
  /**
   * Decode the local image (`file://...` URI from cache) and call
   * `WallpaperManager.setBitmap`. Resolves once the wallpaper is applied;
   * rejects with a message on permission/decode/write failures.
   */
  setWallpaper(localUri: string, target: WallpaperTarget): Promise<boolean>;
};

const native = requireOptionalNativeModule<WallpaperSetterModule>('WallpaperSetter');

/** Available only on Android (and only after a native rebuild). */
export const isWallpaperSetterAvailable = native != null;

export async function setWallpaperNative(
  localUri: string,
  target: WallpaperTarget,
): Promise<boolean> {
  if (!native) {
    throw new Error('WallpaperSetter native module is not available on this platform.');
  }
  return native.setWallpaper(localUri, target);
}

export type { WallpaperTarget };
