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
const LAVENDER = '#c9a7ff';
const BLUE = '#7da6ff';
const MINT = '#73f0c8';
const GOLD = '#ffd27a';
const CORAL = '#ff9d6e';
const MAGENTA = '#ff7ac0';

// The original 3 packs are BUNDLED (offline). The newer packs are HOSTED on
// Supabase Storage (public `wallpapers` bucket, `couple/<id>/<slot>.png`) so
// ~50 MB of triptych PNGs don't bloat the APK. `CoupleImageSource` accepts a
// URL string directly: `resolveCoupleImageUri` + `downloadToCache` fetch and
// cache it, and `precacheActiveCouplePack` pre-downloads the active pack on
// link / pick so the proximity apply still works on a locked screen. Same URL
// convention as constants/mockData.ts + premiumCatalog.ts (built from
// EXPO_PUBLIC_SUPABASE_URL — no import, so this file stays dependency-free).
const SB_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const hostedCouple = (id: string, slot: 'together' | 'boy' | 'girl'): string =>
  `${SB_URL}/storage/v1/object/public/wallpapers/couple/${id}/${slot}.png`;

/**
 * The couple packs — each a boy/girl/together triptych shot in one scene.
 * Boy = role 'a', Girl = role 'b'. The first three are bundled (offline); the
 * rest are hosted on Supabase (see `hostedCouple` above).
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
  // ─── Hosted packs (Supabase) ───────────────────────────────────────────
  {
    id: 'painting-date',
    name: 'Painting Date',
    blurb: 'An art-studio afternoon, painting side by side.',
    accent: LAVENDER,
    togetherImage: hostedCouple('painting-date', 'together'),
    roleAImage: hostedCouple('painting-date', 'boy'),
    roleBImage: hostedCouple('painting-date', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'station-reunion',
    name: 'Station Reunion',
    blurb: 'A long-awaited hug back at the station.',
    accent: ROSE,
    togetherImage: hostedCouple('station-reunion', 'together'),
    roleAImage: hostedCouple('station-reunion', 'boy'),
    roleBImage: hostedCouple('station-reunion', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'sing-together',
    name: 'Sing Together',
    blurb: 'A duet under the stage lights.',
    accent: MAGENTA,
    togetherImage: hostedCouple('sing-together', 'together'),
    roleAImage: hostedCouple('sing-together', 'boy'),
    roleBImage: hostedCouple('sing-together', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'bookshop-date',
    name: 'Bookshop Date',
    blurb: 'A quiet read in a sunlit bookshop.',
    accent: PEACH,
    togetherImage: hostedCouple('bookshop-date', 'together'),
    roleAImage: hostedCouple('bookshop-date', 'boy'),
    roleBImage: hostedCouple('bookshop-date', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'festival-fireworks',
    name: 'Festival Fireworks',
    blurb: 'Sparklers and fireworks on a summer night.',
    accent: BLUE,
    togetherImage: hostedCouple('festival-fireworks', 'together'),
    roleAImage: hostedCouple('festival-fireworks', 'boy'),
    roleBImage: hostedCouple('festival-fireworks', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'photo-booth',
    name: 'Photo Booth',
    blurb: 'Silly selfies in the photo booth.',
    accent: MINT,
    togetherImage: hostedCouple('photo-booth', 'together'),
    roleAImage: hostedCouple('photo-booth', 'boy'),
    roleBImage: hostedCouple('photo-booth', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'love-letters',
    name: 'Love Letters',
    blurb: 'Sealing a love note with a ribbon.',
    accent: PINK,
    togetherImage: hostedCouple('love-letters', 'together'),
    roleAImage: hostedCouple('love-letters', 'boy'),
    roleBImage: hostedCouple('love-letters', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'sunset-meadow',
    name: 'Sunset Meadow',
    blurb: 'A flower-basket picnic at golden hour.',
    accent: GOLD,
    togetherImage: hostedCouple('sunset-meadow', 'together'),
    roleAImage: hostedCouple('sunset-meadow', 'boy'),
    roleBImage: hostedCouple('sunset-meadow', 'girl'),
    roleALabel: 'Boy',
    roleBLabel: 'Girl',
    roleAEmoji: '👦',
    roleBEmoji: '👧',
  },
  {
    id: 'golden-fields',
    name: 'Golden Fields',
    blurb: 'Bicycles and wildflowers at sunset.',
    accent: CORAL,
    togetherImage: hostedCouple('golden-fields', 'together'),
    roleAImage: hostedCouple('golden-fields', 'boy'),
    roleBImage: hostedCouple('golden-fields', 'girl'),
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
