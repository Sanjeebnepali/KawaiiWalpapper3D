import { Colors } from './theme';
import { type CategoryPhoto } from './mockData';
import { moodSections, sectionByKey } from './wallpaperCatalog';

// The app's 7 face/picker MoodIds → the closest real catalog mood folder.
// Catalog has happy/excited/calm/angry directly; sad→crying, surprised→
// confused, neutral→calm as the nearest-content fallback. (love / heartbroken
// / nervous / confused exist in the catalog too and get surfaced via the Home
// "Collections" grid; wiring them as first-class picker moods is a follow-up.)
const MOOD_TO_CATALOG: Record<MoodId, string> = {
  happy: 'happy',
  excited: 'excited',
  calm: 'calm',
  angry: 'angry',
  sad: 'crying',
  surprised: 'confused',
  neutral: 'calm',
};

/**
 * Canonical mood IDs used by both the manual emoji picker AND the camera
 * face detector. Seven moods cover the full emotion palette face-api.js
 * surfaces (happy/sad/angry/surprised/neutral/fearful, with `excited` as
 * a manual-only "happier than happy" tier).
 */
export type MoodId =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'calm'
  | 'excited'
  | 'surprised'
  | 'neutral';

/** Emotions face-api.js' faceExpressionNet returns. `disgusted` is folded into angry. */
export type DetectableEmotion =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'neutral'
  | 'fearful'
  | 'disgusted';

export type MoodDef = {
  id: MoodId;
  label: string;
  emoji: string;
  tagline: string;
  tint: string;
  gradient: [string, string];
  /** Mock-data seed for the wallpaper grid filtered to this mood. */
  seed: string;
};

/**
 * Wallpaper-mood mapping (spec):
 * - happy     → bright colorful cute baby
 * - sad       → soft cozy calm baby
 * - angry     → cool grumpy baby
 * - calm      → minimalist peaceful
 * - excited   → vibrant energetic
 * - surprised → funny shocked baby
 * - neutral   → aesthetic clean
 */
export const MOODS: MoodDef[] = [
  {
    id: 'happy',
    label: 'Happy',
    emoji: '😊',
    tagline: 'Bright · Colorful · Cute',
    tint: Colors.gold,
    gradient: ['#FFD27A', '#FFA75C'],
    seed: 'happy-baby-bright',
  },
  {
    id: 'sad',
    label: 'Sad',
    emoji: '😢',
    tagline: 'Soft · Cozy · Calm',
    tint: '#7DA6FF',
    gradient: ['#7DA6FF', '#5A7BC8'],
    seed: 'sad-baby-soft',
  },
  {
    id: 'angry',
    label: 'Angry',
    emoji: '😠',
    tagline: 'Cool · Grumpy · Bold',
    tint: '#FF7A6E',
    gradient: ['#FF7A6E', '#C8453A'],
    seed: 'angry-baby-grumpy',
  },
  {
    id: 'calm',
    label: 'Calm',
    emoji: '😌',
    tagline: 'Minimalist · Peaceful',
    tint: Colors.cyan,
    gradient: ['#73F0C8', '#3CA875'],
    seed: 'calm-baby-peaceful',
  },
  {
    id: 'excited',
    label: 'Excited',
    emoji: '🤩',
    tagline: 'Vibrant · Energetic',
    tint: '#FF4DD2',
    gradient: ['#FF4DD2', '#FFB44D'],
    seed: 'excited-baby-vibrant',
  },
  {
    id: 'surprised',
    label: 'Surprised',
    emoji: '😲',
    tagline: 'Funny · Shocked',
    tint: Colors.lavender,
    gradient: ['#C9A7FF', '#7C4DFF'],
    seed: 'surprised-baby-shocked',
  },
  {
    id: 'neutral',
    label: 'Neutral',
    emoji: '😐',
    tagline: 'Aesthetic · Clean',
    tint: Colors.text,
    gradient: ['#E5E2E1', '#9DAEC2'],
    seed: 'neutral-baby-aesthetic',
  },
];

/**
 * Manual picker on Mood Home — keeps 5 buttons (the core emotional axes)
 * so the on-screen row stays roomy and emoji + label render at full size
 * without overflowing each 46-ish px cell on a typical phone width.
 */
export const MANUAL_MOOD_IDS: MoodId[] = [
  'happy',
  'sad',
  'angry',
  'calm',
  'excited',
];

/**
 * Notification action buttons — Friend Check-in / Daily Prompt /
 * Sleep-Wake categories register one action per id. We surface ALL 7
 * moods here (was 5 historically) so the user can pick any mood from
 * the system shade without opening the app. The OS shows the first
 * 2–3 buttons collapsed and the rest after expand — that's an Android
 * notification UX constraint we can't change. Order controls expand
 * order in the shade.
 */
export const NOTIFICATION_MOOD_IDS: MoodId[] = [
  'happy',
  'sad',
  'angry',
  'calm',
  'excited',
  'surprised',
  'neutral',
];

export const MOOD_BY_ID: Record<MoodId, MoodDef> = MOODS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<MoodId, MoodDef>,
);

export const getMoodOrDefault = (id: string | null | undefined): MoodDef =>
  (id && MOOD_BY_ID[id as MoodId]) || MOOD_BY_ID.happy;

/**
 * Map a raw face-api.js emotion label to one of our 7 canonical moods.
 * `fearful` and `disgusted` (which the manual picker doesn't expose) fall
 * back to `neutral` and `angry` respectively, per design.
 */
export function emotionToMood(emotion: DetectableEmotion): MoodId {
  switch (emotion) {
    case 'happy':
      return 'happy';
    case 'sad':
      return 'sad';
    case 'angry':
    case 'disgusted':
      return 'angry';
    case 'surprised':
      return 'surprised';
    case 'fearful':
      return 'neutral';
    case 'neutral':
    default:
      return 'neutral';
  }
}

/**
 * Generates the wallpaper grid for a given mood using the same deterministic
 * `picsum.photos` seed strategy as `constants/mockData.ts` — same seed → same
 * image, so re-entering the screen doesn't reshuffle.
 */
export function getMoodWallpapers(id: MoodId, count = 24): CategoryPhoto[] {
  const key = MOOD_TO_CATALOG[id] ?? 'happy';
  const sec = sectionByKey('mood', key) ?? moodSections[0];
  return (sec?.photos ?? []).slice(0, count);
}

/**
 * Inverse of MOOD_TO_CATALOG: a real catalog mood folder key → the picker
 * MoodId that best represents it. Used by lib/moodBucket.getMoodBucket to
 * derive the SEMANTIC mood of a photo from its id (e.g. `mood-crying-3` →
 * 'sad', `mood-happy-1` → 'happy') instead of hashing the id string.
 *
 * Built by INVERTING MOOD_TO_CATALOG (so the two can never drift), then adding
 * the extra catalog folders that have no first-class picker MoodId
 * (love / heartbroken / nervous). MOOD_TO_CATALOG is many-to-one — 'calm' is
 * the folder for BOTH 'calm' and 'neutral' — so we iterate MOODS (canonical
 * order) and let the FIRST/primary mood win: catalog 'calm' → 'calm'.
 */
export const CATALOG_TO_MOOD: Record<string, MoodId> = (() => {
  const inv: Record<string, MoodId> = {};
  for (const m of MOODS) {
    const key = MOOD_TO_CATALOG[m.id];
    if (key && !(key in inv)) inv[key] = m.id;
  }
  if (!('love' in inv)) inv.love = 'happy';            // warm / affectionate → happy
  if (!('heartbroken' in inv)) inv.heartbroken = 'sad'; // grief → sad
  if (!('nervous' in inv)) inv.nervous = 'neutral';     // anxious / fearful → neutral
  return inv;
})();
