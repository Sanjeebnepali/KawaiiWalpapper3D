import { type MoodId } from '../constants/moods';

/**
 * Context-based mood inference — the camera-free fallback that runs in
 * background tasks (when the OS forbids camera access).
 *
 * Inputs are all signals the OS allows in background:
 *   - hour-of-day (0–23)
 *   - day-of-week (0=Sun … 6=Sat)
 *   - recent step count (last hour)
 *
 * The mapping is intentionally hand-tuned, not ML — predictable and easy
 * to reason about. A user who notices "every morning I get Excited" can
 * understand why, which builds trust.
 */

export type ContextSignals = {
  /** Local hour, 0–23. */
  hour: number;
  /** 0 = Sunday, 6 = Saturday. */
  weekday: number;
  /** Steps in the last hour. `null` if pedometer unavailable. */
  recentSteps: number | null;
};

export type ContextMoodResult = {
  mood: MoodId;
  /** Short string the UI / notification body can render. */
  reason: string;
  /** 0–1 fake confidence so the UI can plug into the same meter. */
  confidence: number;
};

/** Default thresholds for "you're actively moving" — tune as needed. */
const STEPS_BURST = 80;       // > 80 in 1h = a short burst (got up, paced)
const STEPS_ACTIVE = 300;     // > 300 in 1h = walking-ish
const STEPS_VERY_ACTIVE = 800; // > 800 in 1h = exercise

export function inferContextMood(s: ContextSignals): ContextMoodResult {
  const { hour, recentSteps } = s;

  // 1) Motion takes precedence — it's the strongest "right now" signal.
  //    Reinforces the morning energy and bumps mood up if the user is out
  //    and moving regardless of the clock. The three step bands also reach
  //    the `surprised` bucket (a sudden burst of movement) so the background
  //    path can select photos that the hash-bucketer assigns to it.
  //
  //    NOTE: `recentSteps` is ALWAYS `null` on Android — the historical-step
  //    read API is iOS-only (see lib/stepCount.ts). So this whole block is
  //    iOS-only in practice; on Android we always fall through to the
  //    time-of-day mapping below. The `!= null` guard makes that safe: no
  //    code path here assumes a non-null step count.
  if (recentSteps != null) {
    if (recentSteps >= STEPS_VERY_ACTIVE) {
      return {
        mood: 'excited',
        reason: `Active — ${recentSteps} steps in the last hour`,
        confidence: 0.9,
      };
    }
    if (recentSteps >= STEPS_ACTIVE) {
      return {
        mood: 'happy',
        reason: `Walking — ${recentSteps} steps in the last hour`,
        confidence: 0.8,
      };
    }
    if (recentSteps >= STEPS_BURST) {
      // A short burst of movement (got up, walked across the room) — read as
      // a small "pep". Maps to `surprised` so that bucket is reachable in
      // the background path instead of only via the random fallback.
      return {
        mood: 'surprised',
        reason: `On the move — ${recentSteps} steps in the last hour`,
        confidence: 0.6,
      };
    }
  }

  // 2) Time of day — the all-day schedule the owner chose (energy front-
  //    loaded to the morning). Kept simple + weekday-independent so it's
  //    predictable: "every morning I get Excited" is easy to understand,
  //    which builds trust. Covers all 7 MoodIds so EVERY hash bucket in
  //    `getMoodBucket` is reachable from the background rotation (audit
  //    MOOD-3 — previously only excited/happy/calm/sad were emitted, so
  //    angry/surprised/neutral photos were unreachable except by the random
  //    fallback). Bands, in clock order:
  //   05–09  Early morning, just woke   → neutral (settling in)
  //   09–11  Morning, fresh energy      → excited
  //   11–13  Late morning, productive   → happy
  //   13–15  Post-lunch lull, irritable → angry (the "afternoon slump")
  //   15–18  Afternoon, mellow flow     → calm
  //   18–21  Evening, wind down         → calm
  //   21–23  Late evening, quieting     → neutral
  //   23–05  Night, cosy / sleepy       → sad (soft)
  if (hour >= 5 && hour < 9) {
    return { mood: 'neutral', reason: 'Early morning — settling in', confidence: 0.6 };
  }
  if (hour >= 9 && hour < 11) {
    return { mood: 'excited', reason: 'Morning — fresh energy', confidence: 0.7 };
  }
  if (hour >= 11 && hour < 13) {
    return { mood: 'happy', reason: 'Late morning — feeling good', confidence: 0.7 };
  }
  if (hour >= 13 && hour < 15) {
    return { mood: 'angry', reason: 'Afternoon slump', confidence: 0.55 };
  }
  if (hour >= 15 && hour < 18) {
    return { mood: 'calm', reason: 'Afternoon flow', confidence: 0.65 };
  }
  if (hour >= 18 && hour < 21) {
    return { mood: 'calm', reason: 'Evening wind-down', confidence: 0.7 };
  }
  if (hour >= 21 && hour < 23) {
    return { mood: 'neutral', reason: 'Late evening — quieting down', confidence: 0.6 };
  }
  // 23–05 — wraps midnight (hour >= 23 || hour < 5).
  return { mood: 'sad', reason: 'Night — cosy & sleepy', confidence: 0.6 };
}

/**
 * Convenience wrapper around `inferContextMood` that builds the signal
 * object from `Date.now()` and a step count supplied by the caller.
 */
export function inferContextMoodNow(
  recentSteps: number | null,
  now: Date = new Date(),
): ContextMoodResult {
  return inferContextMood({
    hour: now.getHours(),
    weekday: now.getDay(),
    recentSteps,
  });
}
