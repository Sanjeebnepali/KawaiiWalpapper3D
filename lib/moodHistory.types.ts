import type { MoodId } from '../constants/moods';
import type { TargetAppId } from './appUsageMonitor';

export type MoodSource =
  | 'manual'
  | 'camera'
  | 'background'
  | 'notification'
  | 'sleepwake';

export type MoodHistoryEntry = {
  /** Stable id — `${at}-${moodId}` is unique within reason. */
  id: string;
  moodId: MoodId;
  at: number;
  source: MoodSource;
  /** 0–1 confidence. Manual selections are always 1. */
  confidence: number;
};

export type LoadedMoodMode = {
  enabled: boolean;
  collectionId: string | null;
  currentPhotoId: string | null;
  bgEnabled: boolean;
  notifEnabled: boolean;
  notifHour: number;
  lastBgMood: MoodId | null;
  /** Background tick rotates within the same mood every tick (true) vs. one
   *  photo per mood until the mood changes (false, default). */
  rotateWithinMood: boolean;
  appOpenEnabled: boolean;
  appOpenTargets: TargetAppId[] | null;
  friendCheckInEnabled: boolean;
  friendCheckInMinutes: number;
  sleepWakeEnabled: boolean;
  sleepWakePackId: string | null;
  sleepWakeWakeHour: number;
  sleepWakeSleepHour: number;
  sleepWakeLastWakeDay: string | null;
  sleepWakeLastSleepDay: string | null;
  /** When sleepWakePackId === 'custom', these hold the two user-picked
   *  photo IDs. Resolved against `getPhotoById` / `searchCatalog`. */
  sleepWakeCustomWakeId: string | null;
  sleepWakeCustomSleepId: string | null;
  /** The continuous driver the user most recently enabled. Narrowed to a
   *  `DriverId` by the consumer (lib/automationMode). Audit MOOD-4. */
  lastEnabledDriver: string | null;
};
