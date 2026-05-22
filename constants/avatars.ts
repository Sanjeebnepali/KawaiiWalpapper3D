/**
 * Curated avatar set for the profile-setup form (change #044).
 *
 * Each entry is a colored circle with an emoji glyph — no image assets needed.
 * The user's selection is stored as the `id` (string) on `profiles.avatar_id`,
 * not the visuals, so we can swap to real kawaii illustrations later without a
 * DB migration. Just keep the ids stable; if you remove an avatar, leave its id
 * in the catalog (or migrate) so old profiles don't break.
 */
export type AvatarDef = {
  /** Stable string id stored in `profiles.avatar_id`. Never reuse. */
  id: string;
  /** Display label below the tile. */
  label: string;
  /** Emoji glyph shown inside the circle. */
  emoji: string;
  /** Background color of the circle. Picked to match `Themes` palette accents. */
  color: string;
};

export const AVATARS: readonly AvatarDef[] = [
  { id: 'bunny',  label: 'Bunny',  emoji: '🐰', color: '#fab3ca' },
  { id: 'star',   label: 'Star',   emoji: '⭐', color: '#ffd35a' },
  { id: 'cloud',  label: 'Cloud',  emoji: '☁️', color: '#a6d8ff' },
  { id: 'heart',  label: 'Heart',  emoji: '💖', color: '#ff8ab1' },
  { id: 'cherry', label: 'Cherry', emoji: '🍒', color: '#f08aa0' },
  { id: 'moon',   label: 'Moon',   emoji: '🌙', color: '#dcb8ff' },
  { id: 'cake',   label: 'Cake',   emoji: '🍰', color: '#ffc1d9' },
  { id: 'bow',    label: 'Bow',    emoji: '🎀', color: '#ff7aa8' },
] as const;

export const DEFAULT_AVATAR_ID = 'bunny';

/** Look up an avatar by id. Falls back to the default if not found. */
export function getAvatar(id: string | null | undefined): AvatarDef {
  if (!id) return AVATARS[0];
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}
