import { Colors } from './theme';

// Accent palette cycled across the real categories / moods / 2D sections so
// each card glows its own color (catalog data carries no color of its own).
export const ACCENTS = [Colors.pink, Colors.cyan, Colors.lavender, Colors.gold];

// Default thumb size — the single biggest perf lever in this app.
// A 720×1280 picsum image decodes to ~3.7 MB of bitmap in RAM; multiply by
// 30 cells in a grid and we're paging ~110 MB just for thumbnails the user
// sees at ~180×180 px. The phone GC-pauses on every scroll. 480×854 decodes
// to ~1.6 MB, still looks crisp at the 80–360 px sizes grids actually
// display at, and keeps total grid memory under 50 MB.
//
// The wallpaper preview screen pays the bandwidth for a high-res variant via
// `picLarge()` since it's a single image at full screen.
export const pic = (seed: string, w = 480, h = 854) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

/** High-res variant used by the full-screen wallpaper preview. */
export const picLarge = (seed: string) =>
  `https://picsum.photos/seed/${seed}/1080/1920`;
