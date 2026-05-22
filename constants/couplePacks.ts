/**
 * Couple Packs — the unit of "couple wallpaper" in the proximity feature.
 *
 * A pack is a triptych of three coordinated images:
 *
 *   togetherImage  — what BOTH phones show when partners are < threshold m
 *                    apart. The "complete scene" (both characters together).
 *   roleAImage     — the BOY half: what shows on role-'a' phone when apart.
 *   roleBImage     — the GIRL half: what shows on role-'b' phone when apart.
 *
 * The two solo images are designed to compose into the together image —
 * each carries "half of the moment" when you're apart, and the picture
 * completes when you're together.
 *
 * Role labels live ON THE PACK, not on the couple. The user's stored role
 * (`'a' | 'b'`) is constant; the LABEL shown depends on the active pack.
 *
 * IMAGES ARE BUNDLED. Each slot is a `require()` of a PNG under
 * `assets/couple/`, so the packs work offline, load instantly, and ship
 * inside the release APK with no hosting/network dependency. The slot type
 * is `CoupleImageSource = number | string`, so a future migration to hosted
 * URLs (Supabase Storage) is a drop-in: swap the `require(...)` for a URL
 * string and nothing else changes — every consumer reads these fields by
 * name and passes them straight to `expo-image` (which accepts both a
 * bundled module number and a URI string) or through
 * `resolveCoupleImageUri()` for the wallpaper-setter.
 */

export type CoupleRole = 'a' | 'b';

/** A bundled `require()` module (number) OR a remote URL string. */
export type CoupleImageSource = number | string;

export type CouplePack = {
  /** Stable id used in DB (`couple_settings.couple_pack_id`) + URLs. */
  id: string;
  /** Display name shown on the pack picker. */
  name: string;
  /** One-line description shown under the name. */
  blurb: string;
  /** Pack accent colour for borders / highlights. Same palette as
   *  `constants/theme.ts` Colors so it composes with the active theme. */
  accent: string;
  /** Image shown on BOTH phones when partners are within proximity. */
  togetherImage: CoupleImageSource;
  /** BOY half — shown on the phone of role 'a' when apart. */
  roleAImage: CoupleImageSource;
  /** GIRL half — shown on the phone of role 'b' when apart. */
  roleBImage: CoupleImageSource;
  /** Label for role 'a' — e.g. "Boy". */
  roleALabel: string;
  /** Label for role 'b' — e.g. "Girl". */
  roleBLabel: string;
  /** Optional emoji shown alongside each role label in the picker. */
  roleAEmoji?: string;
  roleBEmoji?: string;
};

// Accent colours pulled from constants/theme.ts at design time. Hard-
// coding here keeps this file dependency-free for tests / Storybook.
const PINK = '#fab3ca';
const PEACH = '#ffc7a8';
const ROSE = '#f7889b';

/**
 * The three real couple packs, each a boy/girl/together triptych shot in
 * one scene. Boy = role 'a', Girl = role 'b'.
 */
export const couplePacks: CouplePack[] = [
  {
    id: 'lakeside-picnic',
    name: 'Lakeside Picnic',
    blurb: 'Golden-hour picnic by the lake.',
    accent: PEACH,
    togetherImage: require('../assets/couple/pack1-together.png'),
    roleAImage: require('../assets/couple/pack1-boy.png'),
    roleBImage: require('../assets/couple/pack1-girl.png'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'golden-beach',
    name: 'Golden Beach',
    blurb: 'Barefoot on the shore at sunset.',
    accent: ROSE,
    togetherImage: require('../assets/couple/pack2-together.png'),
    roleAImage: require('../assets/couple/pack2-boy.png'),
    roleBImage: require('../assets/couple/pack2-girl.png'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'valentine-hearts',
    name: 'Valentine Hearts',
    blurb: 'Roses & heart balloons, all romance.',
    accent: PINK,
    togetherImage: require('../assets/couple/pack3-together.png'),
    roleAImage: require('../assets/couple/pack3-boy.png'),
    roleBImage: require('../assets/couple/pack3-girl.png'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
];

/** Pick a pack by id; falls back to the first pack if id is unknown. */
export function getCouplePack(id: string | null): CouplePack {
  if (!id) return couplePacks[0];
  return couplePacks.find((p) => p.id === id) ?? couplePacks[0];
}

/** Resolve which image to show given a pack, the user's role, and
 *  whether partners are currently near. The single source of truth for
 *  "which file goes on screen right now."
 *
 *  When `proximity === 'near'`, both phones show the SAME togetherImage.
 *  When `proximity === 'far'`, each phone shows its role-specific
 *  solo image.
 */
export function pickImageForState(
  pack: CouplePack,
  myRole: CoupleRole,
  proximity: 'near' | 'far',
): { image: CoupleImageSource; kind: 'together' | 'solo' } {
  if (proximity === 'near') {
    return { image: pack.togetherImage, kind: 'together' };
  }
  return {
    image: myRole === 'a' ? pack.roleAImage : pack.roleBImage,
    kind: 'solo',
  };
}

/** The solo half for a given role — boy ('a') or girl ('b'). */
export function soloImageForRole(
  pack: CouplePack,
  role: CoupleRole,
): CoupleImageSource {
  return role === 'a' ? pack.roleAImage : pack.roleBImage;
}

/** Role labels resolved against a pack — returns the human label for
 *  the slot the user holds. */
export function labelForRole(pack: CouplePack, role: CoupleRole): string {
  return role === 'a' ? pack.roleALabel : pack.roleBLabel;
}
export function emojiForRole(pack: CouplePack, role: CoupleRole): string | undefined {
  return role === 'a' ? pack.roleAEmoji : pack.roleBEmoji;
}
