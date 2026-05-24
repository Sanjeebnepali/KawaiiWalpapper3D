import { type CoupleImageSource, couplePacks } from './couplePacks';

// --- Couple Theme screen data ---

export type CoupleWallpaper = {
  /** The couple PACK id — tapping a card opens `/couple/preview?packId=…`. */
  id: string;
  image: CoupleImageSource;
  title: string;
  accent: string;
};
// The couple tab shows ONE card per real pack, and only its TOGETHER image
// (the complete two-character scene). The boy/girl solo halves are never
// shown in the grid — they're revealed on the preview screen after a tap,
// where each partner picks which half is theirs.
export const coupleWallpapers: CoupleWallpaper[] = couplePacks.map((p) => ({
  id: p.id,
  image: p.togetherImage,
  title: p.name,
  accent: p.accent,
}));
