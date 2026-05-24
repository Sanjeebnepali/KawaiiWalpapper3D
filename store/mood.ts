import { create } from 'zustand';
import { DEFAULT_ENABLED_TARGETS } from '../lib/appUsageMonitor';
import {
  clearMoodHistory,
  loadLastMood,
  loadMoodHistory,
  loadMoodMode,
  recordMood,
  saveAppOpenEnabled,
  saveAppOpenTargets,
  saveBgEnabled,
  saveCurrentMoodPhoto,
  saveFriendCheckInEnabled,
  saveFriendCheckInMinutes,
  saveLastBgMood,
  saveMoodCollection,
  saveMoodModeEnabled,
  saveNotifEnabled,
  saveNotifHour,
  saveSleepWakeCustomSleep,
  saveSleepWakeCustomWake,
  saveSleepWakeEnabled,
  saveSleepWakeLastSleepDay,
  saveSleepWakeLastWakeDay,
  saveSleepWakePack,
  saveSleepWakeSleepHour,
  saveSleepWakeWakeHour,
  saveLastEnabledDriver,
} from '../lib/moodHistory';
import type { Actions, State } from './mood.types';

/**
 * Mood store — backs the manual emoji picker, the live camera engine, AND
 * the background context-based engine + daily notification.
 *
 * Layered gates:
 *   moodModeEnabled    → toggles the global front-camera engine (in-app)
 *   backgroundEnabled  → toggles the OS-scheduled background task
 *   notifEnabled       → toggles the daily mood-prompt notification
 *
 * Each gate is independent: a user can keep camera off but background on,
 * or vice versa. All three rely on `moodCollectionId` being set — that's
 * the pool the engine pulls photos from. State + action types live in
 * `mood.types.ts`.
 */

export const useMoodStore = create<State & Actions>((set, get) => ({
  hydrated: false,
  hydrating: false,
  currentMood: null,
  lastConfidence: 1,
  lastSource: null,
  history: [],
  moodCollectionId: null,
  currentPhotoId: null,
  moodModeEnabled: false,
  backgroundEnabled: false,
  notifEnabled: false,
  notifHour: 8,
  appOpenEnabled: false,
  appOpenTargets: DEFAULT_ENABLED_TARGETS,
  friendCheckInEnabled: false,
  friendCheckInMinutes: 60,
  sleepWakeEnabled: false,
  sleepWakePackId: null,
  sleepWakeWakeHour: 7,
  sleepWakeSleepHour: 22,
  sleepWakeLastWakeDay: null,
  sleepWakeLastSleepDay: null,
  sleepWakeCustomWakeId: null,
  sleepWakeCustomSleepId: null,
  lastBgMood: null,
  lastEnabledDriver: null,

  hydrate: async () => {
    if (get().hydrated || get().hydrating) return;
    set({ hydrating: true });
    try {
      const [history, lastMood, mode] = await Promise.all([
        loadMoodHistory(),
        loadLastMood(),
        loadMoodMode(),
      ]);
      const userPicked =
        get().currentMood !== null && get().lastSource === 'manual';
      set({
        hydrated: true,
        hydrating: false,
        history,
        currentMood: userPicked ? get().currentMood : lastMood,
        lastSource: userPicked
          ? get().lastSource
          : history[0]?.source ?? (lastMood ? 'manual' : null),
        lastConfidence: userPicked
          ? get().lastConfidence
          : history[0]?.confidence ?? 1,
        moodModeEnabled: mode.enabled,
        moodCollectionId: mode.collectionId,
        currentPhotoId: mode.currentPhotoId,
        backgroundEnabled: mode.bgEnabled,
        notifEnabled: mode.notifEnabled,
        notifHour: mode.notifHour,
        appOpenEnabled: mode.appOpenEnabled,
        appOpenTargets:
          mode.appOpenTargets ?? DEFAULT_ENABLED_TARGETS,
        friendCheckInEnabled: mode.friendCheckInEnabled,
        friendCheckInMinutes: mode.friendCheckInMinutes,
        sleepWakeEnabled: mode.sleepWakeEnabled,
        sleepWakePackId: mode.sleepWakePackId,
        sleepWakeWakeHour: mode.sleepWakeWakeHour,
        sleepWakeSleepHour: mode.sleepWakeSleepHour,
        sleepWakeLastWakeDay: mode.sleepWakeLastWakeDay,
        sleepWakeLastSleepDay: mode.sleepWakeLastSleepDay,
        sleepWakeCustomWakeId: mode.sleepWakeCustomWakeId,
        sleepWakeCustomSleepId: mode.sleepWakeCustomSleepId,
        lastBgMood: mode.lastBgMood,
        lastEnabledDriver: mode.lastEnabledDriver,
      });
    } catch (e) {
      set({ hydrating: false });
      if (__DEV__) console.warn('[mood] hydrate failed:', e);
    }
  },

  resyncFromStorage: async () => {
    try {
      const [history, lastMood, mode] = await Promise.all([
        loadMoodHistory(),
        loadLastMood(),
        loadMoodMode(),
      ]);
      const cur = get();
      // Only overwrite fields if storage has a newer value. The persisted
      // history is the system of record — replace if it differs in length
      // or in the most recent entry's id.
      const incomingTopId = history[0]?.id;
      const currentTopId = cur.history[0]?.id;
      const historyChanged =
        history.length !== cur.history.length || incomingTopId !== currentTopId;

      const patch: Partial<State> = {};
      if (historyChanged) patch.history = history;
      if (lastMood && lastMood !== cur.currentMood) patch.currentMood = lastMood;
      if (mode.currentPhotoId !== cur.currentPhotoId) patch.currentPhotoId = mode.currentPhotoId;
      if (mode.lastBgMood !== cur.lastBgMood) patch.lastBgMood = mode.lastBgMood;
      // Source / confidence — fall back to the most recent history entry.
      const top = history[0];
      if (historyChanged && top) {
        patch.lastSource = top.source;
        patch.lastConfidence = top.confidence;
      }
      if (Object.keys(patch).length > 0) set(patch);
    } catch (e) {
      if (__DEV__) console.warn('[mood] resync failed:', e);
    }
  },

  selectMoodManual: async (id) => {
    set({ currentMood: id, lastSource: 'manual', lastConfidence: 1 });
    const next = await recordMood(id, 'manual', 1);
    set({ history: next });
  },

  reportCameraMood: async (id, confidence) => {
    set({ currentMood: id, lastSource: 'camera', lastConfidence: confidence });
    const next = await recordMood(id, 'camera', confidence);
    set({ history: next });
  },

  clearHistory: async () => {
    await clearMoodHistory();
    set({ history: [], currentMood: null, lastSource: null, lastConfidence: 1 });
  },

  setMoodModeEnabled: async (enabled) => {
    set({ moodModeEnabled: enabled });
    await saveMoodModeEnabled(enabled);
  },

  setMoodCollection: async (id) => {
    set({ moodCollectionId: id });
    await saveMoodCollection(id);
  },

  setCurrentMoodPhoto: async (id) => {
    set({ currentPhotoId: id });
    await saveCurrentMoodPhoto(id);
  },

  setBackgroundEnabled: async (enabled) => {
    set({ backgroundEnabled: enabled });
    await saveBgEnabled(enabled);
  },

  setNotifEnabled: async (enabled) => {
    set({ notifEnabled: enabled });
    await saveNotifEnabled(enabled);
  },

  setNotifHour: async (hour) => {
    set({ notifHour: hour });
    await saveNotifHour(hour);
  },

  setLastBgMood: async (mood) => {
    set({ lastBgMood: mood });
    await saveLastBgMood(mood);
  },

  setAppOpenEnabled: async (enabled) => {
    set({ appOpenEnabled: enabled });
    await saveAppOpenEnabled(enabled);
  },

  setAppOpenTargets: async (ids) => {
    set({ appOpenTargets: ids });
    await saveAppOpenTargets(ids);
  },

  setFriendCheckInEnabled: async (enabled) => {
    set({ friendCheckInEnabled: enabled });
    await saveFriendCheckInEnabled(enabled);
  },

  setFriendCheckInMinutes: async (minutes) => {
    // 1 min – 1440 min (24h). The Android OS rounds anything below 15 up to
    // 15 silently; the UI surfaces that to the user when they enter < 15.
    const clamped = Math.max(1, Math.min(1440, Math.round(minutes)));
    set({ friendCheckInMinutes: clamped });
    await saveFriendCheckInMinutes(clamped);
  },

  setSleepWakeEnabled: async (enabled) => {
    set({ sleepWakeEnabled: enabled });
    await saveSleepWakeEnabled(enabled);
  },

  setSleepWakePackId: async (id) => {
    set({ sleepWakePackId: id });
    await saveSleepWakePack(id);
  },

  setSleepWakeWakeHour: async (hour) => {
    const h = Math.max(0, Math.min(23, Math.round(hour)));
    set({ sleepWakeWakeHour: h });
    await saveSleepWakeWakeHour(h);
  },

  setSleepWakeSleepHour: async (hour) => {
    const h = Math.max(0, Math.min(23, Math.round(hour)));
    set({ sleepWakeSleepHour: h });
    await saveSleepWakeSleepHour(h);
  },

  setSleepWakeLastWakeDay: async (day) => {
    set({ sleepWakeLastWakeDay: day });
    await saveSleepWakeLastWakeDay(day);
  },

  setSleepWakeLastSleepDay: async (day) => {
    set({ sleepWakeLastSleepDay: day });
    await saveSleepWakeLastSleepDay(day);
  },

  setSleepWakeCustomWakeId: async (id) => {
    set({ sleepWakeCustomWakeId: id });
    await saveSleepWakeCustomWake(id);
  },

  setSleepWakeCustomSleepId: async (id) => {
    set({ sleepWakeCustomSleepId: id });
    await saveSleepWakeCustomSleep(id);
  },

  setLastEnabledDriver: async (driver) => {
    set({ lastEnabledDriver: driver });
    await saveLastEnabledDriver(driver);
  },
}));

export const hydrateMoodStore = () => useMoodStore.getState().hydrate();
