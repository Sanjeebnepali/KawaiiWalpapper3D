import { getThemePackPhotos, themePacks } from '../constants/mockData';
import { Colors } from '../constants/theme';

// Pre-pick a hero URL per built-in pack — the same URL the shuffle engine
// will apply for index 0, so the card preview matches what the user gets.
export const PACK_HEROES: Record<string, string> = Object.fromEntries(
  themePacks.map((p) => [p.id, getThemePackPhotos(p.id, 1)[0]?.image ?? p.thumbs[0]]),
);

export const PACK_ACCENTS = [Colors.pink, Colors.lavender, Colors.cyan, Colors.gold];
