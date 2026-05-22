/**
 * App-usage monitor — Tier 2 of the mood-detection cascade.
 *
 * "When the user opens Instagram / Facebook / Gallery / etc., fire a quick-
 * action mood prompt notification so they can pick a mood in one tap."
 *
 * Camera access from another app's process is OS-blocked on Android 10+ /
 * iOS, so the next-best signal is "a target app was just opened." We watch
 * for that via UsageStatsManager (see `modules/usage-stats`).
 *
 * This monitor runs in TWO places:
 *
 *   1. **Background task tick** (`moodBackgroundTask.ts`). Every 30 min – few
 *      hours (OS-decided), check the last 30 min of foreground events. If
 *      any target app opened AND we haven't prompted in the dedupe window,
 *      fire the prompt notification.
 *
 *   2. **Foreground polling** when the user is on Mood Home with the toggle
 *      on. Polls every 60 s so the detection feels live during demo. (This
 *      is on top of the background task so the user sees Tier 2 working
 *      even while sitting on the screen.)
 *
 * The "target apps" list is a small constant below; the user can extend it
 * via the Mood Home settings card in a follow-up. Common apps are pre-seeded.
 */

import {
  getRecentForegroundApps,
  hasUsageAccess,
  isUsageStatsAvailable,
  openUsageSettings,
  type ForegroundEvent,
} from '../modules/usage-stats';
import { fireMoodPromptNotification } from './moodNotifications';

export type TargetAppId = keyof typeof TARGET_APPS;

/**
 * Curated default set. Each entry is a label + the package name (or names —
 * Instagram has separate packages per country/locale, Gallery varies by OEM).
 *
 * Keep this list short — too many target apps means the user gets prompted
 * constantly. The user can deselect any from the Mood Home toggles.
 */
export const TARGET_APPS = {
  instagram: { label: 'Instagram', packages: ['com.instagram.android'] },
  facebook: {
    label: 'Facebook',
    packages: ['com.facebook.katana', 'com.facebook.lite'],
  },
  whatsapp: { label: 'WhatsApp', packages: ['com.whatsapp', 'com.whatsapp.w4b'] },
  youtube: {
    label: 'YouTube',
    packages: ['com.google.android.youtube', 'com.google.android.apps.youtube.music'],
  },
  gallery: {
    label: 'Gallery / Photos',
    packages: [
      'com.google.android.apps.photos',         // Google Photos
      'com.android.gallery3d',                  // AOSP gallery
      'com.miui.gallery',                       // MIUI gallery (Xiaomi)
      'com.vivo.gallery',                       // Vivo gallery
      'com.coloros.gallery3d',                  // ColorOS / OPPO
      'com.sec.android.gallery3d',              // Samsung gallery
      'com.huawei.photos',                      // Huawei photos
    ],
  },
  tiktok: { label: 'TikTok', packages: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'] },
  snapchat: { label: 'Snapchat', packages: ['com.snapchat.android'] },
  twitter: {
    label: 'X / Twitter',
    packages: ['com.twitter.android'],
  },
} as const;

/** Default enabled set — kept conservative so first-launch isn't spammy. */
export const DEFAULT_ENABLED_TARGETS: TargetAppId[] = [
  'instagram',
  'gallery',
  'whatsapp',
];

/** Look up the friendly label for a detected package name, or null. */
export function packageToLabel(pkg: string): { id: TargetAppId; label: string } | null {
  for (const id of Object.keys(TARGET_APPS) as TargetAppId[]) {
    if (TARGET_APPS[id].packages.includes(pkg as never)) {
      return { id, label: TARGET_APPS[id].label };
    }
  }
  return null;
}

/** Build a flat package-name set from the user's enabled-target list. */
function buildWatchSet(enabledIds: TargetAppId[]): Set<string> {
  const s = new Set<string>();
  enabledIds.forEach((id) => {
    TARGET_APPS[id].packages.forEach((p) => s.add(p));
  });
  return s;
}

// ─── module-level state (memoized across calls) ─────────────────────────────
//
// We don't persist this to AsyncStorage — it's just a per-process dedupe
// memo. Persistence would force us to write on every event, which is wasteful.
// Worst case after a process restart: one extra prompt right after relaunch.

let lastPromptAt = 0;

/** Reset the dedupe memo (test only). */
export function resetUsageMonitorMemo() {
  lastPromptAt = 0;
}

/** Result returned by `runUsageMonitorPass` — useful for the UI test button. */
export type UsageMonitorResult =
  | { status: 'not_available'; reason: string }
  | { status: 'no_permission' }
  | { status: 'no_match'; checked: number }
  | { status: 'deduped'; pkg: string; at: number }
  | { status: 'fired'; pkg: string; label: string; at: number };

/**
 * One pass of the monitor. Caller decides the cadence (background task,
 * foreground 60 s timer).
 *
 *   lookbackSec     how far back to scan for foreground events (default 90 s
 *                    for foreground polling; the background task passes
 *                    something larger like 30 min)
 *   dedupeMs         skip if we already prompted for any app within this
 *                    window — prevents notification spam when the user
 *                    rapid-fires through Instagram / Stories / etc.
 *   enabledIds       which TargetAppIds are currently armed (user setting)
 */
export async function runUsageMonitorPass(opts: {
  lookbackSec: number;
  dedupeMs: number;
  enabledIds: TargetAppId[];
}): Promise<UsageMonitorResult> {
  if (!isUsageStatsAvailable) {
    return {
      status: 'not_available',
      reason: 'UsageStats native module not linked (run `npx expo run:android`)',
    };
  }
  if (opts.enabledIds.length === 0) {
    return { status: 'no_match', checked: 0 };
  }

  const granted = await hasUsageAccess();
  if (!granted) return { status: 'no_permission' };

  const events = await getRecentForegroundApps(opts.lookbackSec);
  const watch = buildWatchSet(opts.enabledIds);

  // queryEvents returns newest first; first matching event wins.
  const hit = events.find((e: ForegroundEvent) => watch.has(e.packageName));
  if (!hit) {
    return { status: 'no_match', checked: events.length };
  }

  // Dedupe — same dedupe window applies to ANY app launch, not just the same
  // package. Otherwise opening Instagram then Gallery 30 s later would fire
  // two prompts back-to-back.
  const now = Date.now();
  if (now - lastPromptAt < opts.dedupeMs) {
    return { status: 'deduped', pkg: hit.packageName, at: hit.at };
  }

  const meta = packageToLabel(hit.packageName);
  const label = meta?.label ?? hit.packageName;

  const fired = await fireMoodPromptNotification({
    title: `📸 Just opened ${label}?`,
    body: 'Quick mood check — tap a feeling to update your wallpaper.',
  });

  if (!fired) {
    // Permission missing or notifications module unlinked — surface that to
    // the caller so the UI can show the right error.
    return { status: 'not_available', reason: 'Notification dispatch failed' };
  }

  lastPromptAt = now;
  return { status: 'fired', pkg: hit.packageName, label, at: hit.at };
}

/**
 * Convenience: kick off the Usage-access permission UI. Caller should poll
 * `hasUsageAccess()` after the user returns from Settings (e.g. via an
 * AppState 'active' listener).
 */
export async function requestUsageAccess(): Promise<boolean> {
  if (!isUsageStatsAvailable) return false;
  return openUsageSettings();
}

export { hasUsageAccess, isUsageStatsAvailable };
