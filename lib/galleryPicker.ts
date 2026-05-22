/**
 * Thin wrapper around `expo-image-picker.launchImageLibraryAsync` for the
 * Sleep/Wake custom-pair feature.
 *
 * Returns the `file://` URI of the picked photo, or null if the user
 * cancelled / denied permission / the native module isn't linked.
 *
 * Lazy-required so the rest of the mood subsystem stays loadable before
 * the native rebuild that links expo-image-picker. Without this wrapper,
 * `require('expo-image-picker')` at the top of mood.tsx would throw at
 * parse time on the pre-rebuild app.
 */

type ImagePickerLike = {
  launchImageLibraryAsync?: (options?: {
    mediaTypes?: unknown;
    allowsEditing?: boolean;
    quality?: number;
    selectionLimit?: number;
    allowsMultipleSelection?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri?: string; width?: number; height?: number } | null>;
  }>;
  requestMediaLibraryPermissionsAsync?: () => Promise<{
    granted?: boolean;
    canAskAgain?: boolean;
  }>;
  MediaTypeOptions?: { Images?: unknown };
  MediaType?: unknown;
};

let mod: ImagePickerLike | null = null;
let resolved = false;

function getMod(): ImagePickerLike | null {
  if (resolved) return mod;
  resolved = true;
  try {
    mod = require('expo-image-picker') as ImagePickerLike;
  } catch {
    mod = null;
  }
  return mod;
}

export async function pickGalleryImage(): Promise<{
  ok: boolean;
  uri: string | null;
  reason: 'cancelled' | 'denied' | 'module_missing' | 'failed' | null;
}> {
  const m = getMod();
  if (!m?.launchImageLibraryAsync) {
    return { ok: false, uri: null, reason: 'module_missing' };
  }

  // Permission first.
  if (m.requestMediaLibraryPermissionsAsync) {
    try {
      const p = await m.requestMediaLibraryPermissionsAsync();
      if (!p.granted) {
        return { ok: false, uri: null, reason: 'denied' };
      }
    } catch {
      /* fall through and let launch handle it */
    }
  }

  try {
    // SDK 55 expects `mediaTypes: MediaType | MediaType[] | MediaTypeOptions`.
    // The runtime `MediaType` is a string union (type-only export), so the
    // older `m.MediaType` check evaluates to undefined. Use the explicit
    // array form which is forward-compatible across SDK bumps.
    const result = await m.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      selectionLimit: 1,
    });
    if (result.canceled) {
      return { ok: false, uri: null, reason: 'cancelled' };
    }
    const uri = result.assets?.[0]?.uri ?? null;
    if (!uri) {
      return { ok: false, uri: null, reason: 'failed' };
    }
    return { ok: true, uri, reason: null };
  } catch (e) {
    console.warn('[galleryPicker] single failed:', e);
    return { ok: false, uri: null, reason: 'failed' };
  }
}

export const isGalleryPickerAvailable = () => getMod()?.launchImageLibraryAsync != null;

/**
 * Multi-image variant of `pickGalleryImage`. Lets the user select up to
 * `limit` photos in one go via the OS gallery picker's built-in
 * multi-selection UI (long-press to start selecting, then tap to add).
 *
 * Returns `uris` only when at least one image was picked. `cancelled`
 * means the user dismissed the picker without confirming.
 *
 * Production hardening (changes/056) — these matter on Vivo / MIUI /
 * ColorOS where the picker can OOM-kill our app or send back malformed
 * results:
 *   - `mediaTypes: ['images']` — SDK 55+ array-of-string form. Older
 *     code passed `m.MediaType` (which is a TYPE in SDK 55 — undefined
 *     at runtime), falling back to the deprecated `MediaTypeOptions.Images`
 *     enum. The new form is forward-compatible and explicit.
 *   - `quality: 0.8` instead of 1 — meaningful memory drop on multi-select
 *     when the system loads several decoded bitmaps simultaneously.
 *   - No `allowsEditing` — incompatible with `allowsMultipleSelection`
 *     on iOS, and triggers crash paths on some Android OEM galleries.
 *   - Explicit `console.warn` (NOT __DEV__-gated) so logcat shows the
 *     real exception in a release APK when QA reports a crash.
 *   - Defensive asset extraction: any malformed asset object falls
 *     through to the dedupe filter; a fully-empty result returns
 *     `'failed'` rather than throwing.
 */
export async function pickGalleryImages(opts: { limit: number }): Promise<{
  ok: boolean;
  uris: string[];
  reason: 'cancelled' | 'denied' | 'module_missing' | 'failed' | null;
}> {
  const m = getMod();
  if (!m?.launchImageLibraryAsync) {
    return { ok: false, uris: [], reason: 'module_missing' };
  }
  if (m.requestMediaLibraryPermissionsAsync) {
    try {
      const p = await m.requestMediaLibraryPermissionsAsync();
      if (!p.granted) return { ok: false, uris: [], reason: 'denied' };
    } catch (e) {
      console.warn('[galleryPicker] permission request threw:', e);
      /* fall through and let launch handle it */
    }
  }
  try {
    const result = await m.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, Math.min(10, opts.limit)),
      quality: 0.8,
    });
    if (result.canceled) {
      return { ok: false, uris: [], reason: 'cancelled' };
    }
    const uris = (result.assets ?? [])
      .map((a) => (a && typeof a.uri === 'string' ? a.uri : null))
      .filter((u): u is string => u != null && u.length > 0);
    if (uris.length === 0) {
      console.warn('[galleryPicker] multi returned 0 valid URIs from', result.assets);
      return { ok: false, uris: [], reason: 'failed' };
    }
    return { ok: true, uris, reason: null };
  } catch (e) {
    console.warn('[galleryPicker] multi failed:', e);
    return { ok: false, uris: [], reason: 'failed' };
  }
}
