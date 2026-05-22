import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  type Collection,
  getCollectionIntervalMinutes,
  getNextChangeAt,
  isInDnd,
  parseHHMM,
  type ShuffleMode,
} from '../constants/shuffle';
import { getPhotoById } from '../constants/mockData';
import { runMoodBackgroundOnce } from '../lib/moodBackgroundTask';
import {
  startForegroundShuffleForCollection,
  syncFromNativeShuffle,
} from '../lib/shuffleActions';
import { setAsWallpaper } from '../lib/wallpaperActions';
import {
  isShuffleForegroundAvailable,
  isShuffleForegroundRunning,
} from '../modules/shuffle-foreground';
import { useShuffleStore } from '../store/shuffle';

/**
 * Foreground shuffle engine.
 *
 * Two entry points:
 *
 *   1. **`useShuffleEngineHost()`** — drives the ticker. Mount it ONCE at
 *      the app root via `<ShuffleEngineHost />`. Re-evaluates every
 *      `TICK_MS`, reads the active collection from the store, and applies
 *      the next photo when `lastChangedAt + interval` is in the past.
 *      Survives screen navigation so the user can start a shuffle and walk
 *      away — previously the engine was scoped to the Active screen's
 *      lifecycle and `enableFreeze(true)` (changes/018) paused it the
 *      moment the user navigated elsewhere (changes/024).
 *   2. **`useShuffleEngine(collection)`** — read-only UI status for the
 *      Active screen (countdown, paused/dnd reason) plus a manual
 *      `skipNow()`. Does NOT tick; the root host owns that.
 *
 * Both call `applyNext()` through a module-level mutex (`applyInFlight`)
 * so a manual Skip can't collide with a scheduled tick.
 *
 * iOS: the underlying `setAsWallpaper` saves to Photos and deep-links to
 * Photos.app (Apple forbids programmatic wallpaper change). Engine state
 * still advances + history is recorded so the UI stays consistent.
 *
 * Phase 2 will additionally register `react-native-background-fetch` so
 * the engine ticks with the app closed. Until then, the engine sleeps when
 * the app is backgrounded (we gate on `AppState.currentState === 'active'`).
 */

export type EngineStatus =
  | { kind: 'idle'; reason: 'no-active' | 'paused' | 'empty' | 'dnd' | 'ios' }
  | { kind: 'running'; nextChangeAt: number; intervalMs: number }
  | { kind: 'applying' };

type ApplyResult =
  | { ok: true; photoId: string; image: string }
  | { ok: false; message: string };

function resolvePhoto(photoId: string): { id: string; image: string } | null {
  const photo = getPhotoById(photoId);
  return photo ? { id: photo.id, image: photo.image } : null;
}

function pickNextIndex(
  mode: ShuffleMode,
  currentIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  switch (mode) {
    case 'sequential':
      return (currentIndex + 1) % count;
    case 'random': {
      if (count === 1) return 0;
      let n = Math.floor(Math.random() * count);
      // Avoid immediate repeat.
      if (n === currentIndex) n = (n + 1) % count;
      return n;
    }
    case 'day': {
      // Advance one image per day. The DAY boundary (midnight) is what
      // triggers this tick — see getNextChangeAt — so stepping by one each
      // time cycles through the WHOLE collection, one new image per day,
      // instead of the old weekday-modulo that only ever used the first 7
      // images and re-applied the same one all day.
      return (currentIndex + 1) % count;
    }
    case 'smart': {
      // Bright (first half of array) by day, dark (second half) by night.
      const hour = new Date().getHours();
      const day = hour >= 6 && hour < 18;
      const half = Math.max(1, Math.floor(count / 2));
      const offset = Math.floor(Math.random() * half);
      return day ? offset : Math.min(count - 1, half + offset);
    }
  }
  // Defensive fallback — older persisted state may carry a deleted mode id
  // (e.g. the removed 'mood'). Treat as sequential.
  return (currentIndex + 1) % count;
}

async function applyNextRaw(collection: Collection): Promise<ApplyResult> {
  const photoIds = collection.photoIds;
  if (photoIds.length === 0) {
    return { ok: false, message: 'Collection is empty' };
  }
  const state = useShuffleStore.getState();
  const nextIndex = pickNextIndex(
    collection.mode,
    state.currentIndex,
    photoIds.length,
  );
  const photo = resolvePhoto(photoIds[nextIndex]);
  if (!photo) return { ok: false, message: 'Photo not found' };

  const r = await setAsWallpaper(photo.image, photo.id, 'both');
  if (!r.ok) return { ok: false, message: r.message };

  state.recordChange(
    {
      photoId: photo.id,
      image: photo.image,
      at: Date.now(),
      collectionId: collection.id,
    },
    nextIndex,
  );
  return { ok: true, photoId: photo.id, image: photo.image };
}

// Module-level mutex shared between the root host's tick and the Skip
// button on the Active screen — both call applyNext; we never want overlap.
let applyInFlight = false;
async function applyNext(collection: Collection): Promise<ApplyResult> {
  if (applyInFlight) return { ok: false, message: 'Already applying' };
  applyInFlight = true;
  try {
    return await applyNextRaw(collection);
  } finally {
    applyInFlight = false;
  }
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function isInDndWindow(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return false;
  return isInDnd(nowMinutes(), s, e);
}

/** How often the root host checks "is the active shuffle due?" */
const TICK_MS = 10_000;
/** After a failed apply (permission denied / network), wait this long before retrying so we don't spam. */
const ERROR_BACKOFF_MS = 60_000;

/**
 * Root-mounted ticker. Renders nothing; only effect is the setInterval that
 * advances the active shuffle when due. Mount via `<ShuffleEngineHost />`
 * in the root layout so a single instance runs for the whole app session.
 */
export function useShuffleEngineHost() {
  const hydrated = useShuffleStore((s) => s.hydrated);
  const hydrate = useShuffleStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const errorBackoffUntilRef = useRef(0);

  // Run the full mood-bg helper THE MOMENT the app becomes active. The
  // mood version internally calls `runShuffleBackgroundOnce` first (and
  // returns early if it applied), then does mood + Sleep/Wake fallback
  // work. Without this, a user who missed the wake-time SW notification
  // (didn't tap it / had the phone face-down / OEM killed the bg-fetch
  // dispatch) would stare at the old wallpaper on resume even though
  // it's now past wake-hour. With the mood path on resume, SW catches
  // up immediately. (changes/055)
  useEffect(() => {
    if (!hydrated) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // The native foreground service owns rotation on Android and ticks
        // through Doze. Pull what it applied while we were away so the
        // in-app "current image" + countdown match the real wallpaper —
        // the fix for "the app shows a different image than is applied."
        syncFromNativeShuffle().catch(() => {});
        runMoodBackgroundOnce().catch(() => {
          /* silent — next foreground tick will retry */
        });
      }
    });
    return () => sub.remove();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(async () => {
      // Don't apply while backgrounded — the OS will throttle us and the
      // user can't see it anyway. Phase 2 background-fetch is the right
      // tool for that.
      if (AppState.currentState !== 'active') return;
      if (Date.now() < errorBackoffUntilRef.current) return;

      // On Android the native foreground service is the SINGLE applier —
      // it ticks through Doze via AlarmManager. While it runs, the JS
      // ticker must not apply (two appliers with independent indices fight
      // and show the wrong image); it only mirrors native state so the
      // live countdown stays accurate.
      if (isShuffleForegroundAvailable && isShuffleForegroundRunning()) {
        await syncFromNativeShuffle();
        return;
      }

      // Read live store state on every tick so user changes (timer / mode /
      // pause / DND / switching active collection) take effect immediately
      // without restarting the interval.
      const state = useShuffleStore.getState();
      const id = state.activeCollectionId;
      if (!id) return;
      const collection = state.collections.find((c) => c.id === id);
      if (!collection) return;
      if (collection.photoIds.length === 0) return;
      if (state.paused) return;
      if (isInDndWindow(state.dndStart, state.dndEnd)) return;

      // `lastChangedAt` is set by the instant-apply on activation. If it's
      // somehow null (apply failed at activation), schedule from now so we
      // wait a full interval before firing rather than firing immediately.
      const lastChanged = state.lastChangedAt;
      if (lastChanged == null) {
        useShuffleStore.setState({ lastChangedAt: Date.now() });
        return;
      }
      // Day-based is due at the next midnight; every other mode at
      // lastChanged + interval. getNextChangeAt centralizes that rule.
      if (Date.now() < getNextChangeAt(collection, lastChanged)) return;

      const r = await applyNext(collection);
      if (!r.ok) {
        errorBackoffUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
        // eslint-disable-next-line no-console
        console.warn('[shuffle] auto-apply failed:', r.message);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [hydrated]);
}

/**
 * Active-screen hook. Returns the current display status (countdown /
 * paused / etc) and a manual `skipNow()`. Does NOT drive ticks — those
 * live on the root host so the engine keeps running off-screen.
 */
export function useShuffleEngine(collection: Collection | null) {
  const paused = useShuffleStore((s) => s.paused);
  const dndStart = useShuffleStore((s) => s.dndStart);
  const dndEnd = useShuffleStore((s) => s.dndEnd);
  const lastChangedAt = useShuffleStore((s) => s.lastChangedAt);
  const [applying, setApplying] = useState(false);
  // Re-render every second so the countdown ticks visibly. Cheap — the
  // timer only fires while the Active screen is mounted.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const intervalMs = useMemo(
    () => (collection ? getCollectionIntervalMinutes(collection) * 60_000 : 0),
    [collection],
  );

  const status: EngineStatus = useMemo(() => {
    if (!collection) return { kind: 'idle', reason: 'no-active' };
    if (collection.photoIds.length === 0) return { kind: 'idle', reason: 'empty' };
    if (paused) return { kind: 'idle', reason: 'paused' };
    if (isInDndWindow(dndStart, dndEnd)) return { kind: 'idle', reason: 'dnd' };
    if (applying) return { kind: 'applying' };
    const lc = lastChangedAt ?? Date.now();
    // Day-based counts down to midnight; other modes to lastChanged+interval.
    const nextChangeAt = getNextChangeAt(collection, lc);
    return { kind: 'running', nextChangeAt, intervalMs };
  }, [collection, paused, dndStart, dndEnd, applying, lastChangedAt, intervalMs]);

  const skipNow = useCallback(async () => {
    if (!collection) return { ok: false as const, message: 'No active collection' };
    setApplying(true);
    const r = await applyNext(collection);
    // Keep the native service in lock-step: a manual skip advances the JS
    // index + applies immediately, so restart the FGS from the new index
    // (this also resets native's alarm so the countdown matches). Without
    // this, native would keep its old index/timer and apply a different
    // photo on its next tick.
    if (r.ok && isShuffleForegroundAvailable && isShuffleForegroundRunning()) {
      const fresh = useShuffleStore
        .getState()
        .collections.find((c) => c.id === collection.id);
      if (fresh) await startForegroundShuffleForCollection(fresh);
    }
    setApplying(false);
    return r;
  }, [collection]);

  return {
    status,
    intervalMs,
    skipNow,
    isIos: Platform.OS === 'ios',
  };
}
