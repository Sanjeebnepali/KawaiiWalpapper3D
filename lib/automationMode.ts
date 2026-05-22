/**
 * Automation-mode coordinator — the single source of truth for "which
 * wallpaper automation is allowed to run right now."
 *
 * ─── The rule (chosen by the product owner) ───────────────────────────
 *
 * There are THREE continuous "drivers" that autonomously drive the
 * device wallpaper. They are MUTUALLY EXCLUSIVE — turning one on turns
 * the other two off, so exactly one (or none) is ever active:
 *
 *   - `theme`  — an active Theme-shuffle collection (any mode, including
 *                the "Day-based" / one-per-weekday mode).
 *   - `mood`   — Mood-based background rotation.
 *   - `friend` — Friend check-in ("how are you feeling?" prompts).
 *
 * Sleep/Wake and the daily mood reminder are NOT drivers — they are
 * time-of-day LAYERS that fire at most twice a day and are allowed to
 * coexist with whichever driver is active. They are intentionally never
 * touched by this coordinator.
 *
 * (The Couple-proximity feature is account-bound and GPS-driven; it is
 * deliberately left out of the exclusive set for now — stopping it has
 * cross-partner Supabase side effects. To fold it in later, add a
 * `'couple'` case to `isDriverActive` + `enforceSingleDriver` below; the
 * rest of the wiring already iterates the `DRIVERS` array.)
 *
 * ─── Why this exists ──────────────────────────────────────────────────
 *
 * Before this module the only coordination was a pair of ad-hoc
 * "mood ↔ shuffle" guards scattered through `lib/moodBootstrap.ts`.
 * Friend check-in was never coordinated at all, so it kept running on
 * top of an active shuffle and the two fought over the wallpaper — the
 * exact "they all run at once" bug the user reported. Centralising the
 * rule here means every entry point (UI toggle, store subscriber, boot
 * restore) enforces the SAME contract.
 */

import { useMoodStore } from '../store/mood';
import { useShuffleStore } from '../store/shuffle';

export type DriverId = 'theme' | 'mood' | 'friend';

/** Ordered list the subscribers + UI iterate. Add `'couple'` here (and
 *  the two switch statements) to bring it under the same rule. */
export const DRIVERS: DriverId[] = ['theme', 'mood', 'friend'];

export const DRIVER_LABELS: Record<DriverId, string> = {
  theme: 'Theme shuffle',
  mood: 'Mood-based',
  friend: 'Friend check-in',
};

/**
 * Re-entrancy guard. While the coordinator is tearing down the other
 * drivers it flips off store flags, and those flips synchronously notify
 * the store subscribers. Without this guard, a subscriber would react to
 * "mood turned off" by re-running its own exclusivity logic → an
 * A-stops-B-stops-A loop. We suppress only the EXCLUSIVITY reaction; the
 * lifecycle side-effects (start/stop foreground service, (un)register the
 * OS background task) MUST still run, so subscribers guard just their
 * "a driver turned on → enforce" block with `isExclusivitySuppressed()`.
 */
let suppressing = false;

export function isExclusivitySuppressed(): boolean {
  return suppressing;
}

/** Is a given driver currently active, per the live store state? */
export function isDriverActive(id: DriverId): boolean {
  switch (id) {
    case 'theme':
      return useShuffleStore.getState().activeCollectionId != null;
    case 'mood':
      return useMoodStore.getState().backgroundEnabled;
    case 'friend':
      return useMoodStore.getState().friendCheckInEnabled;
  }
}

/** Which drivers are running right now. */
export function getActiveDrivers(): DriverId[] {
  return DRIVERS.filter(isDriverActive);
}

/** Narrow an arbitrary persisted string to a known DriverId, or null. */
function asDriverId(v: string | null | undefined): DriverId | null {
  return v != null && (DRIVERS as string[]).includes(v) ? (v as DriverId) : null;
}

/**
 * The driver the bootstrap single-driver normalization should KEEP when more
 * than one was persisted active (legacy state). Prefers the user's last
 * explicitly-enabled driver (persisted marker) when it's actually one of the
 * currently-active set; otherwise falls back to the highest-priority active
 * driver (DRIVERS order). Audit MOOD-4 — replaces the old `activeDrivers[0]`
 * which always kept theme > mood > friend regardless of the user's choice.
 */
export function resolveDriverToKeep(active: DriverId[]): DriverId {
  const marker = asDriverId(useMoodStore.getState().lastEnabledDriver);
  if (marker && active.includes(marker)) return marker;
  return active[0];
}

/** Human labels of the OTHER drivers currently running — handy for a
 *  toast BEFORE you turn `keep` on (so you can tell the user what is
 *  about to be paused). */
export function otherActiveDriverLabels(keep: DriverId): string[] {
  return getActiveDrivers()
    .filter((d) => d !== keep)
    .map((d) => DRIVER_LABELS[d]);
}

/**
 * Turn OFF every continuous driver except `keep`. Sleep/Wake and the
 * daily reminder are layers and are left untouched. Returns the labels
 * of the drivers that were actually stopped (for a toast). Idempotent —
 * calling it when nothing else is active is a cheap no-op returning [].
 *
 * Flipping each driver's store flag triggers that store's subscriber in
 * `moodBootstrap.ts`, which performs the real teardown (stop the
 * foreground service, cancel notifications, unregister the bg task). We
 * only flip the flags here; the subscribers own the OS-level cleanup.
 */
export async function enforceSingleDriver(keep: DriverId): Promise<string[]> {
  // Already inside an enforcement pass (called re-entrantly from a
  // subscriber that fired during our own teardown) → do nothing.
  if (suppressing) return [];

  // Persist the user's most-recent driver choice. `keep` IS the driver the
  // user just enabled (every caller passes the freshly-on driver), so this
  // doubles as the "last enabled driver" marker the bootstrap reads to break
  // legacy multi-driver ties — audit MOOD-4.
  void useMoodStore.getState().setLastEnabledDriver(keep);

  const stopped: string[] = [];
  suppressing = true;
  try {
    const shuffle = useShuffleStore.getState();
    const mood = useMoodStore.getState();

    if (keep !== 'theme' && shuffle.activeCollectionId != null) {
      stopped.push(DRIVER_LABELS.theme);
      shuffle.setActive(null); // sync — shuffle subscriber stops its FGS
    }
    if (keep !== 'mood' && mood.backgroundEnabled) {
      stopped.push(DRIVER_LABELS.mood);
      await mood.setBackgroundEnabled(false); // mood subscriber stops its FGS
    }
    if (keep !== 'friend' && mood.friendCheckInEnabled) {
      stopped.push(DRIVER_LABELS.friend);
      await mood.setFriendCheckInEnabled(false); // mood subscriber stops its FGS
    }
  } finally {
    suppressing = false;
  }
  return stopped;
}
