// ─── Sleep/Wake fallback ──────────────────────────────────────────────────
//
// If the user has Sleep/Wake mode on and the wake (or sleep) image hasn't
// been applied today, AND we're past the corresponding hour, apply it now.
// This catches users who ignore the wake/sleep notification — within the
// next bg tick (≈ 30 min on Android WorkManager), the wallpaper switches
// automatically without any tap.
//
// Returns true if any image was applied this pass.

import { useMoodStore } from '../store/mood';
import { applySleepWakePhoto } from './moodEngineActions';
import { recordMood } from './moodHistory';

export async function runSleepWakeFallback(): Promise<boolean> {
  const s = useMoodStore.getState();
  if (!s.sleepWakeEnabled || !s.sleepWakePackId) return false;

  // Degenerate guard: if sleep hour == wake hour the two windows below
  // collapse (sleep window becomes empty, wake window becomes "always"),
  // which would fire wake every day and sleep never. There's no coherent
  // schedule to honour, so do nothing. The UI hour pickers also prevent
  // selecting equal hours; this is belt + braces for any persisted state.
  if (s.sleepWakeSleepHour === s.sleepWakeWakeHour) return false;

  const now = new Date();
  // LOCAL date — `toISOString()` is UTC and disagrees with `getHours()`
  // (local) in any non-UTC timezone, so the per-day stamp could mark
  // today's wake as belonging to tomorrow (or yesterday) and either
  // skip or re-fire incorrectly. The hour comparison below is local;
  // the day key must be too.
  const today = localDayKey(now);
  const hour = now.getHours();

  let appliedSomething = false;

  // SLEEP first — if it's late (≥ sleep hour) OR very early morning (<wake),
  // we're in the "should be sleeping" zone. Same-day stamp guards re-apply.
  const inSleepWindow =
    s.sleepWakeSleepHour <= s.sleepWakeWakeHour
      ? hour >= s.sleepWakeSleepHour && hour < s.sleepWakeWakeHour
      : hour >= s.sleepWakeSleepHour || hour < s.sleepWakeWakeHour;
  if (inSleepWindow && s.sleepWakeLastSleepDay !== today) {
    const r = await applySleepWakePhoto(s.sleepWakePackId, 'sleep');
    if (r.ok && r.photoId) {
      await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
      await useMoodStore.getState().setSleepWakeLastSleepDay(today);
      const next = await recordMood('calm', 'sleepwake', 1);
      useMoodStore.setState({
        currentMood: 'calm',
        lastSource: 'sleepwake',
        lastConfidence: 1,
        history: next,
      });
      appliedSomething = true;
      // One pass applies AT MOST one image. If we're in the sleep window
      // we're by definition NOT in the wake window (the two are mutually
      // exclusive once sleepHour != wakeHour), but return early anyway so a
      // future edit can never accidentally apply both sleep + wake in a
      // single tick and visibly "flip" the wallpaper twice.
      return true;
    }
  }

  // WAKE — if we're past wake hour AND not yet in sleep hour.
  const inWakeWindow =
    s.sleepWakeSleepHour <= s.sleepWakeWakeHour
      ? hour < s.sleepWakeSleepHour || hour >= s.sleepWakeWakeHour
      : hour >= s.sleepWakeWakeHour && hour < s.sleepWakeSleepHour;
  if (inWakeWindow && s.sleepWakeLastWakeDay !== today) {
    const r = await applySleepWakePhoto(s.sleepWakePackId, 'wake');
    if (r.ok && r.photoId) {
      await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
      await useMoodStore.getState().setSleepWakeLastWakeDay(today);
      const next = await recordMood('happy', 'sleepwake', 1);
      useMoodStore.setState({
        currentMood: 'happy',
        lastSource: 'sleepwake',
        lastConfidence: 1,
        history: next,
      });
      appliedSomething = true;
    }
  }

  return appliedSomething;
}

/** Local-time `YYYY-MM-DD` for the bg-task + notification day stamps. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
