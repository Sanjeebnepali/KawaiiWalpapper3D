import { Colors } from './theme';
import { moodSections, sectionByKey } from './wallpaperCatalog';
import { type CategoryPhoto } from './mockData.types';

// --- Mood Based screen data ---

export type Mood = {
  id: string;
  label: string;
  icon: 'happy-outline' | 'leaf-outline' | 'heart-outline' | 'flash-outline' | 'cloud-outline' | 'cafe-outline';
  tint: string;
};
export const moods: Mood[] = [
  { id: 'happy', label: 'Happy', icon: 'happy-outline', tint: Colors.gold },
  { id: 'calm', label: 'Calm', icon: 'leaf-outline', tint: Colors.cyan },
  { id: 'romantic', label: 'Romantic', icon: 'heart-outline', tint: Colors.pink },
  { id: 'focused', label: 'Focused', icon: 'flash-outline', tint: Colors.lavender },
  { id: 'dreamy', label: 'Dreamy', icon: 'cloud-outline', tint: Colors.lavender },
  { id: 'cozy', label: 'Cozy', icon: 'cafe-outline', tint: Colors.gold },
];
export const getMoodById = (id: string): Mood | undefined =>
  moods.find((m) => m.id === id);

// sad/surprised/neutral have no own folder → nearest real content.
const MOOD_ALIAS: Record<string, string> = {
  sad: 'crying',
  surprised: 'confused',
  neutral: 'calm',
};
export function getMoodPhotos(moodId: string, count = 18): CategoryPhoto[] {
  const key = MOOD_ALIAS[moodId] ?? moodId;
  const sec = sectionByKey('mood', key);
  return (sec?.photos ?? moodSections[0]?.photos ?? []).slice(0, count);
}
