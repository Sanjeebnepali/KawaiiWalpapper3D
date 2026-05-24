import type { MoodId } from '../constants/moods';
import type { TargetAppId } from './appUsageMonitor';
import {
  APP_OPEN_ENABLED_KEY, APP_OPEN_TARGETS_KEY, BG_ENABLED_KEY,
  CURRENT_PHOTO_KEY, FRIEND_ENABLED_KEY, FRIEND_MINUTES_KEY,
  getStorage, isMissingNativeModule, LAST_BG_MOOD_KEY,
  LAST_ENABLED_DRIVER_KEY, markBridgeDead, MODE_COLLECTION_KEY,
  MODE_ENABLED_KEY, NOTIF_ENABLED_KEY, NOTIF_HOUR_KEY, parseNum,
  SW_CUSTOM_SLEEP_KEY, SW_CUSTOM_WAKE_KEY, SW_ENABLED_KEY,
  SW_LAST_SLEEP_DAY_KEY, SW_LAST_WAKE_DAY_KEY, SW_PACK_KEY,
  SW_SLEEP_HOUR_KEY, SW_WAKE_HOUR_KEY,
} from './moodHistory.storage';
import type { LoadedMoodMode } from './moodHistory.types';

// ─── Mood Mode persistence ──────────────────────────────────────────────────
// In-memory fallback so the feature still works pre-rebuild.
let memModeEnabled = false;
let memModeCollection: string | null = null;
let memCurrentPhoto: string | null = null;
let memBgEnabled = false;
let memNotifEnabled = false;
let memNotifHour = 8;
let memLastBgMood: MoodId | null = null;
let memAppOpenEnabled = false;
let memAppOpenTargets: TargetAppId[] | null = null;
let memFriendEnabled = false;
let memFriendMinutes = 60;
let memSwEnabled = false;
let memSwPack: string | null = null;
let memSwWakeHour = 7;
let memSwSleepHour = 22;
let memSwLastWakeDay: string | null = null;
let memSwLastSleepDay: string | null = null;
let memSwCustomWake: string | null = null;
let memSwCustomSleep: string | null = null;
let memLastEnabledDriver: string | null = null;

function memSnapshot(): LoadedMoodMode {
  return {
    enabled: memModeEnabled,
    collectionId: memModeCollection,
    currentPhotoId: memCurrentPhoto,
    bgEnabled: memBgEnabled,
    notifEnabled: memNotifEnabled,
    notifHour: memNotifHour,
    lastBgMood: memLastBgMood,
    appOpenEnabled: memAppOpenEnabled,
    appOpenTargets: memAppOpenTargets,
    friendCheckInEnabled: memFriendEnabled,
    friendCheckInMinutes: memFriendMinutes,
    sleepWakeEnabled: memSwEnabled,
    sleepWakePackId: memSwPack,
    sleepWakeWakeHour: memSwWakeHour,
    sleepWakeSleepHour: memSwSleepHour,
    sleepWakeLastWakeDay: memSwLastWakeDay,
    sleepWakeLastSleepDay: memSwLastSleepDay,
    sleepWakeCustomWakeId: memSwCustomWake,
    sleepWakeCustomSleepId: memSwCustomSleep,
    lastEnabledDriver: memLastEnabledDriver,
  };
}

export async function loadMoodMode(): Promise<LoadedMoodMode> {
  const s = getStorage();
  if (!s) return memSnapshot();
  try {
    const [
      enabledRaw, collId, photoId,
      bgRaw, notifRaw, notifHourRaw, lastBgRaw,
      appOpenRaw, appOpenTargetsRaw,
      friendRaw, friendMinRaw,
      swRaw, swPackRaw, swWakeRaw, swSleepRaw,
      swLastWakeRaw, swLastSleepRaw,
      swCustomWakeRaw, swCustomSleepRaw,
      lastEnabledDriverRaw,
    ] = await Promise.all([
      s.getItem(MODE_ENABLED_KEY),
      s.getItem(MODE_COLLECTION_KEY),
      s.getItem(CURRENT_PHOTO_KEY),
      s.getItem(BG_ENABLED_KEY),
      s.getItem(NOTIF_ENABLED_KEY),
      s.getItem(NOTIF_HOUR_KEY),
      s.getItem(LAST_BG_MOOD_KEY),
      s.getItem(APP_OPEN_ENABLED_KEY),
      s.getItem(APP_OPEN_TARGETS_KEY),
      s.getItem(FRIEND_ENABLED_KEY),
      s.getItem(FRIEND_MINUTES_KEY),
      s.getItem(SW_ENABLED_KEY),
      s.getItem(SW_PACK_KEY),
      s.getItem(SW_WAKE_HOUR_KEY),
      s.getItem(SW_SLEEP_HOUR_KEY),
      s.getItem(SW_LAST_WAKE_DAY_KEY),
      s.getItem(SW_LAST_SLEEP_DAY_KEY),
      s.getItem(SW_CUSTOM_WAKE_KEY),
      s.getItem(SW_CUSTOM_SLEEP_KEY),
      s.getItem(LAST_ENABLED_DRIVER_KEY),
    ]);
    let appOpenTargets: TargetAppId[] | null = null;
    if (appOpenTargetsRaw) {
      try {
        const parsed = JSON.parse(appOpenTargetsRaw);
        if (Array.isArray(parsed)) appOpenTargets = parsed as TargetAppId[];
      } catch { /* fall through to null → default */ }
    }
    return {
      enabled: enabledRaw === '1',
      collectionId: collId ?? null,
      currentPhotoId: photoId ?? null,
      bgEnabled: bgRaw === '1',
      notifEnabled: notifRaw === '1',
      notifHour: parseNum(notifHourRaw, 8, 0, 23),
      lastBgMood: (lastBgRaw as MoodId | null) ?? null,
      appOpenEnabled: appOpenRaw === '1',
      appOpenTargets,
      friendCheckInEnabled: friendRaw === '1',
      friendCheckInMinutes: parseNum(friendMinRaw, 60, 1, 24 * 60),
      sleepWakeEnabled: swRaw === '1',
      sleepWakePackId: swPackRaw ?? null,
      sleepWakeWakeHour: parseNum(swWakeRaw, 7, 0, 23),
      sleepWakeSleepHour: parseNum(swSleepRaw, 22, 0, 23),
      sleepWakeLastWakeDay: swLastWakeRaw ?? null,
      sleepWakeLastSleepDay: swLastSleepRaw ?? null,
      sleepWakeCustomWakeId: swCustomWakeRaw ?? null,
      sleepWakeCustomSleepId: swCustomSleepRaw ?? null,
      lastEnabledDriver: lastEnabledDriverRaw ?? null,
    };
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
    return memSnapshot();
  }
}

export async function saveLastEnabledDriver(driver: string | null): Promise<void> {
  memLastEnabledDriver = driver;
  const s = getStorage();
  if (!s) return;
  try {
    if (driver) await s.setItem(LAST_ENABLED_DRIVER_KEY, driver);
    else await s.removeItem(LAST_ENABLED_DRIVER_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveAppOpenEnabled(enabled: boolean): Promise<void> {
  memAppOpenEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(APP_OPEN_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveAppOpenTargets(targets: TargetAppId[]): Promise<void> {
  memAppOpenTargets = targets;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(APP_OPEN_TARGETS_KEY, JSON.stringify(targets)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveFriendCheckInEnabled(enabled: boolean): Promise<void> {
  memFriendEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(FRIEND_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveFriendCheckInMinutes(minutes: number): Promise<void> {
  memFriendMinutes = minutes;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(FRIEND_MINUTES_KEY, String(minutes)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeEnabled(enabled: boolean): Promise<void> {
  memSwEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakePack(id: string | null): Promise<void> {
  memSwPack = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_PACK_KEY, id);
    else await s.removeItem(SW_PACK_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeWakeHour(hour: number): Promise<void> {
  memSwWakeHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_WAKE_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeSleepHour(hour: number): Promise<void> {
  memSwSleepHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_SLEEP_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeLastWakeDay(day: string | null): Promise<void> {
  memSwLastWakeDay = day;
  const s = getStorage();
  if (!s) return;
  try {
    if (day) await s.setItem(SW_LAST_WAKE_DAY_KEY, day);
    else await s.removeItem(SW_LAST_WAKE_DAY_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeLastSleepDay(day: string | null): Promise<void> {
  memSwLastSleepDay = day;
  const s = getStorage();
  if (!s) return;
  try {
    if (day) await s.setItem(SW_LAST_SLEEP_DAY_KEY, day);
    else await s.removeItem(SW_LAST_SLEEP_DAY_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeCustomWake(id: string | null): Promise<void> {
  memSwCustomWake = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_CUSTOM_WAKE_KEY, id);
    else await s.removeItem(SW_CUSTOM_WAKE_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeCustomSleep(id: string | null): Promise<void> {
  memSwCustomSleep = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_CUSTOM_SLEEP_KEY, id);
    else await s.removeItem(SW_CUSTOM_SLEEP_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveBgEnabled(enabled: boolean): Promise<void> {
  memBgEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(BG_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveNotifEnabled(enabled: boolean): Promise<void> {
  memNotifEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(NOTIF_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveNotifHour(hour: number): Promise<void> {
  memNotifHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(NOTIF_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveLastBgMood(mood: MoodId | null): Promise<void> {
  memLastBgMood = mood;
  const s = getStorage();
  if (!s) return;
  try {
    if (mood) await s.setItem(LAST_BG_MOOD_KEY, mood);
    else await s.removeItem(LAST_BG_MOOD_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveMoodModeEnabled(enabled: boolean): Promise<void> {
  memModeEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try {
    await s.setItem(MODE_ENABLED_KEY, enabled ? '1' : '0');
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}

export async function saveMoodCollection(id: string | null): Promise<void> {
  memModeCollection = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(MODE_COLLECTION_KEY, id);
    else await s.removeItem(MODE_COLLECTION_KEY);
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}

export async function saveCurrentMoodPhoto(id: string | null): Promise<void> {
  memCurrentPhoto = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(CURRENT_PHOTO_KEY, id);
    else await s.removeItem(CURRENT_PHOTO_KEY);
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}
