/**
 * Cache/download helpers for wallpaper actions — extracted from
 * `wallpaperActions.ts`. The FileSystem concern (fetch-to-cache, internet
 * image download, cache clearing) lives here; the apply/save/share actions
 * stay in `wallpaperActions.ts`.
 */
import * as FileSystem from 'expo-file-system/legacy';

const sanitize = (s: string) => s.replace(/[^a-z0-9-]/gi, '_');

/**
 * Core download/copy into a caller-chosen base directory. Returns the local
 * `file://` URI.
 *
 * URI handling:
 *   - `file://…` — already on disk, return unchanged.
 *   - `content://…` — Android scoped-storage URI from the OS gallery picker.
 *     MediaLibrary.createAssetAsync silently fails on content:// in
 *     scoped-storage mode (Android 11+), surfacing as "Save to Gallery /
 *     Save wallpaper" failures on user-imported custom album photos. COPY
 *     to a real file:// path first so every downstream consumer (MediaLibrary,
 *     native WallpaperSetter, the FGS bitmap decode, expo-sharing) sees a
 *     plain file path.
 *   - http(s):// — download into `baseDir`.
 *
 * `baseDir` decides volatility: `cacheDirectory` is OS-evictable (fine for
 * apply-immediately paths), `documentDirectory` persists until uninstall
 * (required for images a scheduled FGS must still find hours later — see
 * `downloadToPersistent`).
 */
async function downloadInto(
  baseDir: string,
  url: string,
  id: string,
): Promise<string> {
  if (url.startsWith('file://')) {
    return url;
  }
  // Stable name derived from the id so repeated saves of the same wallpaper
  // overwrite one file instead of accumulating copies.
  const target = `${baseDir}kawaii-${sanitize(id)}.jpg`;
  if (url.startsWith('content://')) {
    // Copy through FileSystem so MediaLibrary / WallpaperManager get a
    // canonical file path instead of a scoped content:// grant.
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
  //
  // Existing-file short-circuit. The target path is derived from `id`, which is
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

/** Download a remote image into the OS cache dir; returns the local `file://`
 *  URI. Use for apply-NOW paths — the cache dir is evictable under storage
 *  pressure, which is fine when the file is consumed within the same call. */
export async function downloadToCache(url: string, id: string): Promise<string> {
  return downloadInto(FileSystem.cacheDirectory ?? '', url, id);
}

/**
 * Download a remote image into the app's PERSISTENT document dir; returns the
 * local `file://` URI.
 *
 * Use when a native foreground service must still find the file at a scheduled
 * time that can be many hours after the app was last open (Sleep/Wake hours,
 * the context-mood tick). The cache dir (`downloadToCache`) is evicted by the
 * OS/aggressive OEMs while the app is backgrounded — when the alarm fired the
 * service hit `!File(path).exists()` and silently applied nothing, which read
 * to the user as "Sleep/Wake only works if I open the app first." The document
 * dir survives until uninstall, so the scheduled apply still has its bitmap.
 */
export async function downloadToPersistent(
  url: string,
  id: string,
): Promise<string> {
  return downloadInto(FileSystem.documentDirectory ?? '', url, id);
}

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
