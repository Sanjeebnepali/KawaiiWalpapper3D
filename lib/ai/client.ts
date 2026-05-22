/**
 * Public AI image-generation client — the only function the UI calls.
 *
 * Resolves the user's active provider from `useAIStore`, delegates the
 * request, records the result in history on success. Wraps every call
 * in a try/catch to enforce the "providers return Error objects instead
 * of throwing" contract — anything that escapes a provider's own error
 * handling lands here and becomes an `unknown` ImageGenError.
 *
 * Callers should NOT import individual providers directly. This file
 * is the seam.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useSettingsStore } from '../../store/settings';
import { useShuffleStore } from '../../store/shuffle';
import { useAIStore } from '../../store/ai';
import { getProvider } from './registry';
import type { ImageGenRequest, ImageGenResult } from './types';

// ─── Concurrent-quota reservation (AI-3) ─────────────────────────────────
// `todayCount()` only reflects generations already RECORDED in history —
// it can't see requests that are mid-flight (the await between the gate
// check and `recordGeneration`). At `used === cap-1`, two concurrent
// calls would both read `used < cap`, both fire, and both record —
// overshooting the cap (a real overspend on paid providers).
//
// Fix: reserve a slot synchronously at call-start by counting in-flight
// requests in a module-level counter, and gate on `used + inFlight`.
// The reservation is released in a `finally`, whether the call
// succeeds, errors, or is cancelled. Module scope so it's shared across
// every concurrent caller within one app session.
let inFlightReservations = 0;

export async function generateImage(
  req: ImageGenRequest,
  signal?: AbortSignal,
): Promise<ImageGenResult> {
  const providerId = useAIStore.getState().providerId;
  const provider = getProvider(providerId);

  // Daily quota gate. The Settings → "Max Generation Per Day" slider
  // owns this value (5–100, step 5). Previously the slider was
  // cosmetic — the store value was never consulted. Now we refuse
  // to call the provider when the user has already hit their cap
  // for the day, so the slider becomes a real spend-control even on
  // paid providers.
  //
  // Count already-recorded generations PLUS the ones currently in
  // flight, so two concurrent calls at `used === cap-1` can't both
  // slip through (AI-3).
  const cap = useSettingsStore.getState().maxGenPerDay;
  const used = useAIStore.getState().todayCount();
  if (used + inFlightReservations >= cap) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: `Daily limit reached (${used + inFlightReservations}/${cap}). Raise it in Settings → Max Generation Per Day.`,
    };
  }

  // Reserve the slot before the await so a sibling call sees it.
  inFlightReservations++;
  try {
    const result = await provider.generateImage(req, signal);
    if (result.ok) {
      // Record in history. Cap at HISTORY_LIMIT per the store; the
      // store handles eviction so the call site stays cheap.
      useAIStore.getState().recordGeneration({
        localUri: result.localUri,
        prompt: req.prompt,
        provider: result.provider,
        model: result.model,
        createdAt: Date.now(),
        width: result.width,
        height: result.height,
        // Persist timing so a re-opened generation from the recent
        // strip can still show its duration in the preview (AI-7).
        durationMs: result.durationMs,
      });
    }
    return result;
  } catch (e) {
    if (__DEV__) console.warn('[ai/client] provider threw:', e);
    return {
      ok: false,
      reason: 'unknown',
      message:
        e instanceof Error && e.message
          ? e.message
          : 'Generation failed — please retry.',
    };
  } finally {
    // Release the reservation on every exit path (success records into
    // history, failure/cancel just frees the slot back up).
    inFlightReservations--;
  }
}

/**
 * Delete a generated image — removes it from AI history AND from
 * any mood/shuffle collection that referenced its `file://` URI, then
 * unlinks the cache file. Returns `{ ok, removedFromPools }` so the
 * caller can craft an accurate toast.
 *
 * Why touch the pools too: a user can "Add to pool" from the preview
 * screen (change 061's preview UX). If we delete the cache file but
 * leave a stale URI in `collection.photoIds`, the pool ends up with
 * a broken image — `WallpaperManager.setBitmap` fails to decode the
 * missing file (the same crash class as `changes/063`'s shuffle
 * decode failure). Cleanest: remove the reference everywhere at
 * delete-time so every downstream consumer stays consistent.
 *
 * FileSystem.deleteAsync is idempotent (`idempotent: true`) so a
 * second call on the same URI doesn't throw.
 */
export async function deleteGeneration(
  localUri: string,
): Promise<{ ok: boolean; removedFromPools: number }> {
  if (!localUri) return { ok: false, removedFromPools: 0 };

  // 1. Drop from AI history (pure store update).
  useAIStore.getState().removeGeneration(localUri);

  // 2. Scrub from every shuffle/mood collection that referenced it.
  const shuffle = useShuffleStore.getState();
  let removedFromPools = 0;
  for (const c of shuffle.collections) {
    if (!Array.isArray(c.photoIds)) continue;
    if (!c.photoIds.includes(localUri)) continue;
    const nextIds = c.photoIds.filter((p) => p !== localUri);
    shuffle.updateCollection(c.id, { photoIds: nextIds });
    removedFromPools++;
  }

  // 3. Unlink the cache file. Best-effort — if the file's already
  //    gone (OS evicted, user wiped cache), idempotent makes the
  //    call a no-op rather than a throw.
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (e) {
    if (__DEV__) console.warn('[ai/client] deleteAsync failed:', e);
    // Continue — the history + pool entries are already gone, which
    // is the user-visible part of "delete."
  }
  return { ok: true, removedFromPools };
}

export type { ImageGenRequest, ImageGenResult } from './types';
