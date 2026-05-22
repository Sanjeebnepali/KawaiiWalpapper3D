import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Vibration } from 'react-native';
import {
  isWallpaperSetterAvailable,
  setWallpaperNative,
} from '../modules/wallpaper-setter';
import { useSettingsStore } from '../store/settings';

/**
 * Shared wallpaper action helpers used by `WallpaperMenu`. All exports return
 * `{ ok, message }` so the UI layer can show a single toast either way; they
 * never throw to their callers.
 *
 * Native modules used (need a native rebuild after install):
 *   - expo-file-system (legacy) → download a remote image to cache
 *   - expo-media-library         → save to gallery + Featured Folder album
 *   - expo-sharing               → system share sheet
 *   - expo-intent-launcher       → Android SET_WALLPAPER intent
 *   - expo-clipboard             → copy link
 */

export const FEATURED_ALBUM = 'Kawaii Baby';

export type ActionResult = { ok: boolean; message: string };
export type WallpaperTarget = 'lock' | 'home' | 'both';

/** Download a remote image into the cache dir; returns the local `file://` URI.
 *
 * URI handling:
 *   - `file://…` — already on disk, return unchanged.
 *   - `content://…` — Android scoped-storage URI from the OS gallery picker.
 *     MediaLibrary.createAssetAsync silently fails on content:// in
 *     scoped-storage mode (Android 11+), surfacing as "Save to Gallery /
 *     Save wallpaper" failures on user-imported custom album photos. COPY
 *     to a real file:// path in cacheDirectory first so every downstream
 *     consumer (MediaLibrary, native WallpaperSetter, expo-sharing) sees
 *     a plain file path.
 *   - http(s):// — download into cache.
 */
export async function downloadToCache(url: string, id: string): Promise<string> {
  if (url.startsWith('file://')) {
    return url;
  }
  if (url.startsWith('content://')) {
    // Copy through FileSystem so MediaLibrary / WallpaperManager get a
    // canonical file path instead of a scoped content:// grant. The
    // destination uses a stable name derived from the id so repeated
    // saves of the same wallpaper don't accumulate cache files.
    const target = `${FileSystem.cacheDirectory ?? ''}kawaii-${sanitize(id)}.jpg`;
    try {
      // Clear any prior copy first — copyAsync rejects when the dest
      // already exists on some Android versions.
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists) {
        await FileSystem.deleteAsync(target, { idempotent: true });
      }
      await FileSystem.copyAsync({ from: url, to: target });
      return target;
    } catch (e) {
      // Last-ditch fallback: if copyAsync chokes on the content URI
      // (some OEM galleries refuse cross-app FileProvider reads), at
      // least surface a real error rather than feeding a dangling URI
      // to MediaLibrary further downstream.
      throw new Error(
        `Could not copy gallery image: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }
  }
  // picsum URLs have no extension; jpg is the actual served content type.
  const target = `${FileSystem.cacheDirectory ?? ''}kawaii-${sanitize(id)}.jpg`;
  // Cache-hit short-circuit. The target path is derived from `id`, which is
  // stable per photo (catalog ids never change; user-pasted URLs hash to the
  // same id), so a non-empty file at the target path is the same bytes we'd
  // re-download. Skipping the network round-trip is the difference between
  // "Mood Based apply succeeds on a locked screen with Wi-Fi suspended" and
  // a silent failure inside the FGS tick handler. Users can clear the cache
  // from Settings → Clear Cache when they want fresh downloads.
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (
      info.exists &&
      'size' in info &&
      typeof info.size === 'number' &&
      info.size > 0
    ) {
      return target;
    }
  } catch {
    // getInfoAsync rarely throws, but if it does fall through to the
    // download — better to spend a network call than fail the apply.
  }
  const res = await FileSystem.downloadAsync(url, target);
  if (res.status !== 200) {
    throw new Error(`Download failed (HTTP ${res.status})`);
  }
  return res.uri;
}

const sanitize = (s: string) => s.replace(/[^a-z0-9-]/gi, '_');

/**
 * Download a user-pasted http(s) image URL into the app's cache directory
 * and return the local `file://` URI — used by the "Browse from internet"
 * source in the collection editor. The image lives ONLY in the app's
 * cacheDirectory; it never lands in the device gallery (no MediaLibrary
 * call). Returns a discriminated result so the caller can toast a
 * specific error reason.
 */
export async function downloadInternetImage(url: string): Promise<{
  ok: boolean;
  uri: string | null;
  reason: 'invalid_url' | 'download_failed' | null;
}> {
  const trimmed = url.trim();
  if (!/^https?:\/\/\S+/i.test(trimmed)) {
    return { ok: false, uri: null, reason: 'invalid_url' };
  }
  try {
    // Stable id derived from the URL so the same URL re-downloaded later
    // overwrites the same cache file rather than accumulating duplicates.
    let h = 5381;
    for (let i = 0; i < trimmed.length; i++) {
      h = ((h << 5) + h + trimmed.charCodeAt(i)) >>> 0;
    }
    const uri = await downloadToCache(trimmed, `user-${h.toString(36)}`);
    return { ok: true, uri, reason: null };
  } catch (e) {
    if (__DEV__) console.warn('[wallpaperActions] internet download failed:', e);
    return { ok: false, uri: null, reason: 'download_failed' };
  }
}

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

/**
 * Recursively delete everything in the app cache directory. Used by
 * Settings → Clear Cache. Returns the rough bytes freed for the toast.
 * Failures are surfaced (returns 0) so the user gets honest feedback.
 */
export async function clearAppCache(): Promise<{ ok: boolean; bytes: number }> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return { ok: false, bytes: 0 };
  try {
    let freed = 0;
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const name of entries) {
      const path = `${dir}${name}`;
      try {
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists && 'size' in info && typeof info.size === 'number') {
          freed += info.size;
        }
        await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        /* skip files locked by another process — best effort */
      }
    }
    return { ok: true, bytes: freed };
  } catch {
    return { ok: false, bytes: 0 };
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
