import * as Clipboard from 'expo-clipboard';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Vibration } from 'react-native';
import {
  isWallpaperSetterAvailable,
  setWallpaperNative,
} from '../modules/wallpaper-setter';
import { useSettingsStore } from '../store/settings';
import { downloadToCache } from './wallpaperActions.download';

/**
 * Shared wallpaper action helpers used by `WallpaperMenu`. All exports return
 * `{ ok, message }` so the UI layer can show a single toast either way; they
 * never throw to their callers.
 *
 * The cache/download helpers (`downloadToCache`, `downloadInternetImage`,
 * `clearAppCache`) live in `wallpaperActions.download.ts` and are re-exported
 * below so existing importers of `lib/wallpaperActions` are unchanged.
 *
 * Native modules used (need a native rebuild after install):
 *   - expo-media-library         → save to gallery + Featured Folder album
 *   - expo-sharing               → system share sheet
 *   - expo-intent-launcher       → Android SET_WALLPAPER intent
 *   - expo-clipboard             → copy link
 */
export {
  clearAppCache,
  downloadInternetImage,
  downloadToCache,
} from './wallpaperActions.download';

export const FEATURED_ALBUM = 'Kawaii Baby';

export type ActionResult = { ok: boolean; message: string };
export type WallpaperTarget = 'lock' | 'home' | 'both';

async function ensureMediaPermission(): Promise<boolean> {
  const { granted } = await MediaLibrary.requestPermissionsAsync();
  return granted;
}

/**
 * Save to the user's gallery. With `useFeaturedFolder`, the image is placed
 * (or moved into) the "Kawaii Baby" album, creating it if it doesn't exist.
 *
 * Custom mood-pool photos (user-imported gallery picks + URL downloads)
 * arrive as `file://…/cache/…` URIs. Some Android OEMs (notably MIUI 14+ /
 * ColorOS 14) reject `createAssetAsync` on app-private cache paths with a
 * silent "Could not get asset" rejection — the only error surface the user
 * ever saw. We now fall back to `saveToLibraryAsync` so the photo still
 * lands in the gallery even when the album-targeted save isn't possible.
 */
export async function saveToGallery(
  url: string,
  id: string,
  useFeaturedFolder: boolean,
): Promise<ActionResult> {
  try {
    const granted = await ensureMediaPermission();
    if (!granted) return { ok: false, message: 'Gallery permission denied' };

    const localUri = await downloadToCache(url, id);

    if (useFeaturedFolder) {
      try {
        const asset = await MediaLibrary.createAssetAsync(localUri);
        const existing = await MediaLibrary.getAlbumAsync(FEATURED_ALBUM);
        if (existing) {
          await MediaLibrary.addAssetsToAlbumAsync(asset, existing, false);
        } else {
          await MediaLibrary.createAlbumAsync(FEATURED_ALBUM, asset, false);
        }
        maybeVibrate(useSettingsStore.getState());
        return { ok: true, message: `✓ Saved to "${FEATURED_ALBUM}"` };
      } catch (albumErr) {
        // Album path failed — most often on user-imported custom photos
        // where the asset insert refuses an app-private file path.
        // saveToLibraryAsync uses MediaStore directly and is more lenient.
        console.warn('[wallpaperActions] album save failed, falling back:', albumErr);
        await MediaLibrary.saveToLibraryAsync(localUri);
        maybeVibrate(useSettingsStore.getState());
        return {
          ok: true,
          message: '✓ Saved to gallery (album skipped)',
        };
      }
    }

    await MediaLibrary.saveToLibraryAsync(localUri);
    maybeVibrate(useSettingsStore.getState());
    return { ok: true, message: '✓ Saved to gallery' };
  } catch (e) {
    console.warn('[wallpaperActions] saveToGallery failed:', e);
    return { ok: false, message: errorMessage(e, 'Failed to save image') };
  }
}

/** Share via the system share sheet (WhatsApp / Instagram / etc.). */
export async function shareWallpaper(url: string, id: string): Promise<ActionResult> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { ok: false, message: 'Sharing is not available on this device' };
    }
    const localUri = await downloadToCache(url, id);
    await Sharing.shareAsync(localUri, {
      dialogTitle: 'Share wallpaper',
      mimeType: 'image/jpeg',
    });
    // Share sheet handles its own UX — no toast needed.
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Failed to share image') };
  }
}

/**
 * Set as wallpaper — one tap on Android, deep-link on iOS.
 *
 * - **Android**: call our local `WallpaperSetter` Expo module which
 *   invokes `WallpaperManager.setBitmap` directly with `FLAG_SYSTEM`,
 *   `FLAG_LOCK`, or both. No OS picker, no crop editor — the wallpaper is
 *   applied in one tap. If the native module isn't available (e.g. a JS-
 *   only reload before the next native build), fall back to the legacy
 *   `ACTION_ATTACH_DATA` path via MediaStore.
 *
 * - **iOS**: no public API can set the wallpaper from a third-party app.
 *   Save the image to Photos and deep-link into Photos via
 *   `photos-redirect://` so the user is one tap from
 *   Photos › Share › Use as Wallpaper.
 */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

const TARGET_LABEL: Record<WallpaperTarget, string> = {
  lock: 'lock screen',
  home: 'home screen',
  both: 'lock + home',
};

export async function setAsWallpaper(
  url: string,
  id: string,
  target: WallpaperTarget,
): Promise<ActionResult> {
  try {
    const localUri = await downloadToCache(url, id);
    // Read the live settings ONCE per apply so a toggle flip mid-flight
    // doesn't change behaviour halfway through. autoDownload chains a
    // gallery save after every apply; vibrationOnDownload pulses on
    // success. Both are user-controlled toggles in Settings.
    const settings = useSettingsStore.getState();

    if (Platform.OS === 'android') {
      if (isWallpaperSetterAvailable) {
        await setWallpaperNative(localUri, target);
        await maybeChainSaveToGallery(url, id, settings);
        maybeVibrate(settings);
        return { ok: true, message: `✓ Applied to ${TARGET_LABEL[target]}` };
      }
      // Fallback for JS-only reload before native rebuild: surface the
      // image in the system "Set as wallpaper" picker via MediaStore.
      const r = await setAsWallpaperLegacyAndroid(localUri, target);
      if (r.ok) {
        await maybeChainSaveToGallery(url, id, settings);
        maybeVibrate(settings);
      }
      return r;
    }

    // iOS: save then deep-link to Photos so the user is one tap away from
    // Use-as-Wallpaper inside Photos.app.
    const granted = await ensureMediaPermission();
    if (!granted) return { ok: false, message: 'Gallery permission denied' };
    await MediaLibrary.saveToLibraryAsync(localUri);
    maybeVibrate(settings);
    try {
      await Linking.openURL('photos-redirect://');
    } catch {
      // ignored: user can open Photos manually
    }
    return {
      ok: true,
      message: `Saved to Photos — tap Share › Use as Wallpaper (${TARGET_LABEL[target]})`,
    };
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Failed to set wallpaper') };
  }
}

/**
 * If the user has Auto Download or Save to Gallery on, save the wallpaper
 * AFTER a successful apply. Honours the Featured Folder toggle so the
 * chained save mirrors what the Save action in the menu would do.
 * Failures are swallowed — the wallpaper IS applied, the gallery copy is
 * a convenience.
 */
async function maybeChainSaveToGallery(
  url: string,
  id: string,
  settings: ReturnType<typeof useSettingsStore.getState>,
): Promise<void> {
  if (!settings.autoDownload && !settings.saveToGallery) return;
  try {
    await saveToGallery(url, id, settings.featuredFolder);
  } catch {
    /* Apply already succeeded — gallery save is a best-effort extra. */
  }
}

function maybeVibrate(
  settings: ReturnType<typeof useSettingsStore.getState>,
): void {
  if (!settings.vibrationOnDownload) return;
  try {
    // 50 ms pulse — short enough to read as a tap-confirm rather than a
    // notification buzz. VIBRATE permission is already in app.json.
    Vibration.vibrate(50);
  } catch {
    /* ignore — vibration unavailable on emulators / locked-down OEMs */
  }
}

async function setAsWallpaperLegacyAndroid(
  localUri: string,
  target: WallpaperTarget,
): Promise<ActionResult> {
  const granted = await ensureMediaPermission();
  if (!granted) return { ok: false, message: 'Gallery permission denied' };

  const asset = await MediaLibrary.createAssetAsync(localUri);
  const contentUri = `content://media/external/images/media/${asset.id}`;
  try {
    await IntentLauncher.startActivityAsync(
      'android.intent.action.ATTACH_DATA',
      {
        data: contentUri,
        type: 'image/jpeg',
        flags: FLAG_GRANT_READ_URI_PERMISSION,
        extra: { mimeType: 'image/jpeg' },
      },
    );
  } catch {
    await IntentLauncher.startActivityAsync(
      'android.intent.action.SET_WALLPAPER',
    );
  }
  return { ok: true, message: `✓ Pick "${TARGET_LABEL[target]}" in the picker` };
}

/** Copy a sharable link (or the image URL) to the clipboard. */
export async function copyLink(url: string): Promise<ActionResult> {
  try {
    await Clipboard.setStringAsync(url);
    return { ok: true, message: '✓ Link copied' };
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'Failed to copy link') };
  }
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
