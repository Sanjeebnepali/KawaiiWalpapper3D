import { requireOptionalNativeModule } from 'expo';

/**
 * Local Expo module wrapping Android's UsageStatsManager.
 *
 * Used by `lib/appUsageMonitor.ts` to detect when the user opens one of a
 * configured set of "target apps" (Instagram, Facebook, Gallery, etc.). When
 * a target app is detected the mood subsystem fires a quick-action
 * notification so the user can pick a mood in one tap without opening us.
 *
 * Requires the `PACKAGE_USAGE_STATS` special-access permission. This is NOT
 * a runtime permission you can request with a popup — the user must enable
 * it in Settings → Apps → Special access → Usage access. We deep-link them
 * there via `openUsageSettings()`.
 *
 * Android-only. `requireOptionalNativeModule` returns `null` on iOS / before
 * the next native rebuild so callers can fall back gracefully.
 */
type UsageStatsModule = {
  /** True iff the user has granted PACKAGE_USAGE_STATS to this app. */
  hasUsageAccess(): Promise<boolean>;

  /** Open Settings → Usage access so the user can grant the permission. */
  openUsageSettings(): Promise<boolean>;

  /**
   * Return foreground-app events from the last `lookbackSec` seconds, newest
   * first. Each event is the package name + timestamp (ms since epoch) of a
   * MOVE_TO_FOREGROUND transition.
   *
   * Returns an empty array if permission is missing or the OS API rejects.
   */
  getRecentForegroundApps(lookbackSec: number): Promise<ForegroundEvent[]>;
};

export type ForegroundEvent = {
  packageName: string;
  /** ms since epoch. */
  at: number;
};

const native = requireOptionalNativeModule<UsageStatsModule>('UsageStats');

/** Available only on Android (and only after a native rebuild). */
export const isUsageStatsAvailable = native != null;

export async function hasUsageAccess(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.hasUsageAccess();
  } catch {
    return false;
  }
}

export async function openUsageSettings(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.openUsageSettings();
  } catch {
    return false;
  }
}

export async function getRecentForegroundApps(
  lookbackSec: number,
): Promise<ForegroundEvent[]> {
  if (!native) return [];
  try {
    return await native.getRecentForegroundApps(lookbackSec);
  } catch {
    return [];
  }
}
