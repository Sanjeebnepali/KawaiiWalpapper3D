/**
 * State + actions types for the mood store (`store/mood.ts`). Extracted so the
 * store file holds behaviour and this file holds shape.
 */
import type { MoodId } from '../constants/moods';
import type { TargetAppId } from '../lib/appUsageMonitor';
import type { MoodHistoryEntry, MoodSource } from '../lib/moodHistory';

export type State = {
  hydrated: boolean;
  hydrating: boolean;
  currentMood: MoodId | null;
  lastConfidence: number;
  lastSource: MoodSource | null;
  history: MoodHistoryEntry[];

  // Pool + currently-applied
  moodCollectionId: string | null;
  currentPhotoId: string | null;

  // Engine gates
  moodModeEnabled: boolean;
  backgroundEnabled: boolean;
  notifEnabled: boolean;
  notifHour: number;            // 0–23, local time

  // Tier 2 — app-usage monitor (deprecated in changes/036; left for
  // backwards-compat with persisted state, no longer wired into any UI).
  appOpenEnabled: boolean;
  appOpenTargets: TargetAppId[];

  // Friend check-in — repeating "how are you feeling?" notification
  friendCheckInEnabled: boolean;
  friendCheckInMinutes: number;   // 15 ≤ N ≤ 1440

  // Sleep/Wake mode — two daily transitions (wake image at wakeHour,
  // sleep image at sleepHour) driven by a curated pack of 2 wallpapers.
  sleepWakeEnabled: boolean;
  sleepWakePackId: string | null;
  sleepWakeWakeHour: number;       // 0–23
  sleepWakeSleepHour: number;      // 0–23
  /** Last day (YYYY-MM-DD) we successfully applied the wake/sleep image.
   *  Used by the bg-task fallback to avoid re-applying mid-day. */
  sleepWakeLastWakeDay: string | null;
  sleepWakeLastSleepDay: string | null;
  /** When sleepWakePackId === 'custom', these hold the user-picked photo
   *  IDs. Both must be non-null for the engine + notification handler to
   *  resolve images successfully. */
  sleepWakeCustomWakeId: string | null;
  sleepWakeCustomSleepId: string | null;

  // Background dedupe
  lastBgMood: MoodId | null;

  /** The continuous driver ('theme' | 'mood' | 'friend') the user most
   *  recently enabled. Persisted so the bootstrap single-driver
   *  normalization keeps the user's last choice instead of the fixed
   *  DRIVERS-order winner. Typed loosely here to avoid a circular import
   *  with lib/automationMode (which owns the DriverId type). Audit MOOD-4. */
  lastEnabledDriver: string | null;
};

export type Actions = {
  hydrate: () => Promise<void>;
  /**
   * Re-load persisted state from AsyncStorage and merge into the in-memory
   * store. Covers the case where a notification handler or background task
   * wrote to disk while the React process was DEAD — on app resume we'd
   * otherwise keep showing stale state (the hydrate gate prevents a
   * re-load via hydrate()).
   */
  resyncFromStorage: () => Promise<void>;
  selectMoodManual: (id: MoodId) => Promise<void>;
  reportCameraMood: (id: MoodId, confidence: number) => Promise<void>;
  clearHistory: () => Promise<void>;

  setMoodModeEnabled: (enabled: boolean) => Promise<void>;
  setMoodCollection: (id: string | null) => Promise<void>;
  setCurrentMoodPhoto: (id: string | null) => Promise<void>;

  setBackgroundEnabled: (enabled: boolean) => Promise<void>;
  setNotifEnabled: (enabled: boolean) => Promise<void>;
  setNotifHour: (hour: number) => Promise<void>;
  setLastBgMood: (mood: MoodId | null) => Promise<void>;

  setAppOpenEnabled: (enabled: boolean) => Promise<void>;
  setAppOpenTargets: (ids: TargetAppId[]) => Promise<void>;

  setFriendCheckInEnabled: (enabled: boolean) => Promise<void>;
  setFriendCheckInMinutes: (minutes: number) => Promise<void>;

  setSleepWakeEnabled: (enabled: boolean) => Promise<void>;
  setSleepWakePackId: (id: string | null) => Promise<void>;
  setSleepWakeWakeHour: (hour: number) => Promise<void>;
  setSleepWakeSleepHour: (hour: number) => Promise<void>;
  setSleepWakeLastWakeDay: (day: string | null) => Promise<void>;
  setSleepWakeLastSleepDay: (day: string | null) => Promise<void>;
  setSleepWakeCustomWakeId: (id: string | null) => Promise<void>;
  setSleepWakeCustomSleepId: (id: string | null) => Promise<void>;

  setLastEnabledDriver: (driver: string | null) => Promise<void>;
};
