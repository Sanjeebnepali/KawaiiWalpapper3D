/**
 * Single source of truth: which Downloads folder maps to which place in the
 * app. Changing a row + re-running `optimize` then `gen-catalog` re-maps
 * everything cheaply — no churn in app code.
 *
 *   group: 'mood' | 'category' | '2d'
 *   key:   url-safe slug used in the Storage path + catalog
 *   label: human label shown in the UI
 *
 * Folders NOT listed here are ignored (that's how the junk folders —
 * project / framer-crash-course-assets / Sad Girl Animation_files — and the
 * Couple page are excluded).
 */

const SRC_ROOT = 'C:\\Users\\Sanju\\Downloads';
const PROJECT_REF = 'snhtsymzsfaptwhqodej';
const BUCKET = 'wallpapers';

// Don't enlarge images smaller than this; just cap the big ones.
const TARGET_WIDTH = 1080;
// Bumped 80 → 90 to reduce compression softness on full-screen wallpapers
// (owner reported blur). Source files are ~941px wide, so this is the main
// crispness lever short of higher-resolution originals.
const WEBP_QUALITY = 90;

// Bump when re-encoding so devices/CDN fetch the new bytes instead of a cached
// copy at the same path (expo-image + Supabase cache by full URL).
const ASSET_VERSION = 2;

// Owner decision (2026-05-21): everything ships free for now; premium gets
// marked later. Flip a row's `tier` to 'premium' when that day comes.
const FOLDERS = [
  // ── Moods (emotion folders) → Mood tab + all-day auto mode ──
  { src: 'happy___walpapper',        group: 'mood', key: 'happy',       label: 'Happy',       tier: 'free' },
  { src: 'excited__walpapper',       group: 'mood', key: 'excited',     label: 'Excited',     tier: 'free' },
  { src: 'calm--walpapper',          group: 'mood', key: 'calm',        label: 'Calm',        tier: 'free' },
  { src: 'love__walpapper',          group: 'mood', key: 'love',        label: 'Love',        tier: 'free' },
  { src: 'heartbroken---walpapper',  group: 'mood', key: 'heartbroken', label: 'Heartbroken', tier: 'free' },
  { src: 'nervus---walpapper',       group: 'mood', key: 'nervous',     label: 'Nervous',     tier: 'free' },
  { src: 'confused__walpapper',      group: 'mood', key: 'confused',    label: 'Confused',    tier: 'free' },
  { src: 'angry___walpapper',        group: 'mood', key: 'angry',       label: 'Angry',       tier: 'free' },
  { src: 'crying__walpapper',        group: 'mood', key: 'crying',      label: 'Crying',      tier: 'free' },

  // ── Themed categories (activity folders) → browse grid ──
  { src: 'football--walpapper',      group: 'category', key: 'football',       label: 'Football',       tier: 'free' },
  { src: 'gym1--walpapper',          group: 'category', key: 'gym',            label: 'Gym',            tier: 'free' },
  { src: 'gum',                      group: 'category', key: 'yoga',           label: 'Yoga',           tier: 'free' }, // owner: "gum" folder is the yoga set
  { src: 'studying--walpapper',      group: 'category', key: 'studying',       label: 'Studying',       tier: 'free' },
  { src: 'dance--walpapper',         group: 'category', key: 'dance',          label: 'Dance',          tier: 'free' },
  { src: 'cooking--walpapper',       group: 'category', key: 'cooking',        label: 'Cooking',        tier: 'free' },
  { src: 'gardening--walpapper',     group: 'category', key: 'gardening',      label: 'Gardening',      tier: 'free' },
  { src: 'photography--walpapper',   group: 'category', key: 'photography',    label: 'Photography',    tier: 'free' },
  { src: 'painting ---walpapper',    group: 'category', key: 'painting',       label: 'Painting',       tier: 'free' },
  { src: 'bike---walpapper',         group: 'category', key: 'bike',           label: 'Bike',           tier: 'free' },
  { src: 'sleeping--walpapper',      group: 'category', key: 'sleeping',       label: 'Sleeping',       tier: 'free' },
  { src: 'playing--game',            group: 'category', key: 'playing-game',   label: 'Playing Game',   tier: 'free' },
  { src: 'watchingmovie--walpapper', group: 'category', key: 'watching-movie', label: 'Watching Movie', tier: 'free' },
  { src: 'staylish--walpapper',      group: 'category', key: 'stylish',        label: 'Stylish',        tier: 'free' },

  // ── 2D Kawaii (the 2d-tagged folders) → new "2D Kawaii" section ──
  { src: '2d_kawaii_separate_wallpapers', group: '2d', key: 'mixed',       label: '2D Kawaii',    tier: 'free' },
  { src: 'excited--2d--walp',             group: '2d', key: 'excited',     label: 'Excited',      tier: 'free' },
  { src: 'heartbroken--2d-walpapper',     group: '2d', key: 'heartbroken', label: 'Heartbroken',  tier: 'free' },
  { src: 'nervus--2d--walpapper',         group: '2d', key: 'nervous',     label: 'Nervous',      tier: 'free' },
  { src: 'confused___@d-walpapper',       group: '2d', key: 'confused',    label: 'Confused',     tier: 'free' },
  { src: '2d __angry_walpapper',          group: '2d', key: 'angry',       label: 'Angry',        tier: 'free' },
];

function publicUrl(group, key, file) {
  return `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/${BUCKET}/${group}/${key}/${file}?v=${ASSET_VERSION}`;
}

module.exports = {
  SRC_ROOT, PROJECT_REF, BUCKET, TARGET_WIDTH, WEBP_QUALITY, FOLDERS, publicUrl,
};
