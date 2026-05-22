import { Asset } from 'expo-asset';
import {
  type CoupleImageSource,
  getCouplePack,
  pickImageForState,
} from '../constants/couplePacks';
import { useCoupleStore } from '../store/couple';
import { setAsWallpaper } from './wallpaperActions';

/**
 * Resolve a pack image source to a URI the wallpaper-setter can read.
 *
 *   string  → a remote URL / file:// / content:// URI — returned as-is
 *             (`downloadToCache` in wallpaperActions handles each scheme).
 *   number  → a bundled `require()` module — materialised on disk via
 *             expo-asset and returned as a `file://` URI. `downloadAsync`
 *             copies the asset out of the APK on first use and is a no-op
 *             once cached, so this is cheap on repeat applies.
 *
 * Keeping this here (not in couplePacks.ts) keeps the pack catalog
 * dependency-free; display sites pass the raw source straight to
 * expo-image, which accepts both a module number and a URI.
 */
export async function resolveCoupleImageUri(
  src: CoupleImageSource,
): Promise<string> {
  if (typeof src === 'string') return src;
  const asset = Asset.fromModule(src);
  if (!asset.localUri) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

/**
 * Couple proximity → wallpaper apply.
 *
 * Source of truth for "which wallpaper should be on this device" for a
 * couple-linked user:
 *
 *   proximity === 'near'  →  the active pack's `togetherImage`
 *                            (both phones show the same one).
 *   proximity === 'far'   →  the active pack's role-specific solo
 *                            image — `roleAImage` if the local user
 *                            holds role 'a', else `roleBImage`. The
 *                            two solos are designed to compose into
 *                            the together image.
 *   proximity === 'unknown' OR no pack OR no role → no apply yet.
 *
 * Idempotency: a process-local `lastAppliedKey` short-circuits when the
 * apply target hasn't changed since the last successful write. The
 * store's `proximity` only flips when the Haversine distance crosses
 * the threshold, but a noisy GPS could re-emit the same state every
 * 30 s. Without the dedup we'd keep re-writing the same image — works
 * (`WallpaperManager.setBitmap` is idempotent at the OS level) but
 * wastes battery and triggers a brief "wallpaper changed" toast on
 * some OEM ROMs.
 */

let lastAppliedKey: string | null = null;
let inFlight = false;

export async function applyProximityWallpaper(): Promise<{
  ok: boolean;
  applied: 'together' | 'solo' | 'none';
}> {
  if (inFlight) return { ok: false, applied: 'none' };
  const s = useCoupleStore.getState();
  if (!s.link || s.link.status !== 'linked') {
    return { ok: false, applied: 'none' };
  }
  if (s.proximity === 'unknown') return { ok: false, applied: 'none' };

  const myRole = s.link.myRole;
  if (!myRole) return { ok: false, applied: 'none' };

  const pack = getCouplePack(s.couplePackId);
  const target = pickImageForState(
    pack,
    myRole,
    s.proximity === 'near' ? 'near' : 'far',
  );
  const key = `${pack.id}:${myRole}:${target.kind}`;
  if (lastAppliedKey === key) return { ok: true, applied: 'none' };

  inFlight = true;
  try {
    // Stable per-(pack, slot) id so `downloadToCache` reuses the same
    // file on subsequent applies — bundled assets resolve to a stable
    // path, so same id = same bytes.
    const photoId = `cpl-${pack.id}-${target.kind === 'together' ? 't' : myRole}`;
    const uri = await resolveCoupleImageUri(target.image);
    const r = await setAsWallpaper(uri, photoId, 'both');
    if (r.ok) lastAppliedKey = key;
    return {
      ok: r.ok,
      applied: r.ok ? (target.kind === 'together' ? 'together' : 'solo') : 'none',
    };
  } finally {
    inFlight = false;
  }
}

/** Pre-cache every image referenced by the active pack so the apply
 *  succeeds even on a locked screen with Wi-Fi suspended (same
 *  rationale as the mood-collection precache in changes/076).
 *
 *  For bundled (`require()`) packs this materialises each asset out of the
 *  APK onto disk via expo-asset (no-op once cached); for hosted URL packs
 *  it would download into the same cache `setAsWallpaper` reads. Either
 *  way the apply path then finds the bytes locally.
 *  Fire-and-forget — called from the bootstrap on link / pack swap. */
export async function precacheActiveCouplePack(): Promise<void> {
  const s = useCoupleStore.getState();
  if (!s.link || s.link.status !== 'linked') return;
  const pack = getCouplePack(s.couplePackId);
  const sources: CoupleImageSource[] = [
    pack.togetherImage,
    pack.roleAImage,
    pack.roleBImage,
  ];
  await Promise.all(
    sources.map(async (src) => {
      try {
        await resolveCoupleImageUri(src);
      } catch {
        /* swallow — apply path retries on miss */
      }
    }),
  );
}

/** Test/debug entry — force the next apply to run even if the state
 *  hasn't changed. Used by the Dashboard's "Refresh wallpaper" button. */
export function resetWallpaperDedup(): void {
  lastAppliedKey = null;
}
