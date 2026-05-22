# Couple Packs + neutral roles — triptych model, gender-neutral schema

**Date:** 2026-05-20
**Type:** feature (refines changes/077)

## Problem

User shared two reference images (a boy kneeling alone under a flower
arch, and the SAME arch with a girl now standing next to him) and
described the desired model:

> Each "couple wallpaper" is a SET of 3 images — one solo for him, one
> solo for her, one merged together. When partners are apart, each
> phone shows the partner's own solo image. When close, both phones
> swap to the merged together image. The two solo images visually
> compose into the merged one — you carry "half of the moment" when
> apart, picture completes when together.
>
> While pasting the code, the partner specifies their gender so we
> know who gets which solo image.

My senior-dev pushback in the previous turn:

1. **Gender at link time, not as a hardcoded boy/girl binary** — breaks
   for same-sex / non-binary couples. Better: roles `a` and `b`,
   labels per pack ("Boy/Girl", "Sun/Moon", "Left/Right", …).
2. **Both partners pick their role**, not just the paster. Creator
   picks at Generate; partner picks at Accept (or auto-assigned to
   the opposite).
3. **Pack > free-form single-image picking** to match the triptych
   model. Swap the dashboard's wallpaper picker for a pack picker
   that previews the triptych.

User confirmed: "that's the great idea to be neutral i like it can you
start this now."

## Solution

Additive refinement on top of changes/077 — same Supabase tables,
same realtime channel, same proximity engine. The data model gains
two columns on `couples` and one column on `couple_settings`; the
JS layer swaps the "single couple-wallpaper id" abstraction for a
"pack id + my role" model.

### Pack catalog — `constants/couplePacks.ts`

```ts
type CouplePack = {
  id: string;
  name: string;
  blurb: string;
  accent: string;
  togetherImage: string;
  roleAImage: string;
  roleBImage: string;
  roleALabel: string;     // "Boy" | "Sun" | "Left" | …
  roleBLabel: string;     // "Girl" | "Moon" | "Right" | …
  roleAEmoji?: string;
  roleBEmoji?: string;
};
```

Six starter packs, mixed labels:

- **Classic Proposal** (Boy / Girl, 👦 / 👧, pink accent)
- **Sun & Moon** (Sun / Moon, ☀️ / 🌙, gold accent — the neutral default)
- **Cherry Blossom Pair** (Boy / Girl, pink accent)
- **Astronaut Duo** (Left / Right, 👨‍🚀 / 👩‍🚀, lavender accent)
- **Yin & Yang** (Yin / Yang, 🌑 / 🌕, cyan accent)
- **Winter Mittens** (Boy / Girl, peach accent)

Images today are deterministic picsum URLs via `pic('couple-pack-…')`
seeds, three per pack (together / role-a / role-b). To ship real
assets, swap the three URL fields per pack — no other code change
needed, every consumer reads by name.

Three exported helpers used everywhere:

- `getCouplePack(id)` — id → pack, falls back to the first.
- `pickImageForState(pack, myRole, proximity)` — single source of
  truth for "which file goes on screen right now" (`togetherImage`
  on `near`, role-specific solo on `far`).
- `labelForRole(pack, role)` / `emojiForRole(pack, role)` — resolves
  the role slot against the active pack's labels. Because labels
  live on the pack (not the couple), switching packs swaps labels
  without re-assigning sides.

### Schema migration — `supabase/couple_schema_v2_packs.sql`

Additive on top of the v1 file from changes/077. Idempotent — every
`add column` / `add constraint` / `create or replace function` is
re-runnable.

- `couples.creator_role text check (creator_role in ('a','b'))`
- `couples.partner_role text check (partner_role in ('a','b'))`
- Check constraint `couples_roles_differ_check` — if both set, must
  differ.
- `couple_settings.couple_pack_id text` (the legacy
  `couple_wallpaper_id` column stays but is no longer read).

Updated RPCs:

- `create_couple(p_role text default 'a', p_pack_id text default null)` —
  v1 callers still work (defaults preserve back-compat). New callers
  pass `(role, packId)` to bake the creator's role + initial pack
  into the new row.
- `accept_couple_code(p_code text, p_role text default null)` —
  - `null` role → server auto-assigns the opposite of the creator's
    role (default UX).
  - explicit role → server validates it doesn't collide; raises
    `ROLE_TAKEN` if it does.
  - Returns `creator_role`, `partner_role`, AND `couple_pack_id` in
    addition to v1 columns so the partner's dashboard renders the
    right labels + pack without a second round-trip.

### Lib updates

- **`lib/couple.ts`:**
  - `createCoupleCode(role, packId?)` — propagates the two new args
    to the RPC; mirrors role + pack into the store on success.
  - `acceptCoupleCode(code, role?)` — propagates optional role to the
    RPC; persists `myRole` + `partnerRole` from the RPC response.
  - `fetchActiveCouple()` — selects `creator_role` + `partner_role`,
    resolves them into `{ myRole, partnerRole }` from the local
    user's perspective (creator vs accepter).
  - `setCoupleWallpaper(...)` → renamed `setCouplePack(code, packId)`.
  - `subscribeCouple(code)` — realtime payload reads `couple_pack_id`
    instead of `couple_wallpaper_id`.
  - Error translator gains friendly strings for `BAD_ROLE` and
    `ROLE_TAKEN`.
- **`lib/coupleWallpaper.ts`:**
  - `applyProximityWallpaper()` now resolves
    `pickImageForState(activePack, myRole, proximity)` and writes the
    correct image. The dedup key includes pack id + role so a pack
    swap correctly re-applies.
  - New `precacheActiveCouplePack()` warms `FileSystem.cacheDirectory`
    with all three pack images so the first locked-screen tick has
    local files (same pattern as the mood-collection precache from
    changes/076).
- **`lib/coupleBootstrap.ts`:**
  - Calls `precacheActiveCouplePack()` on link + on pack swap.
  - Subscribes to `couplePackId` change in the store — pack swap
    triggers a fresh precache + immediate `applyProximityWallpaper()`
    so the new wallpaper goes on screen without waiting for the next
    location tick.

### Store updates — `store/couple.ts`

- `CoupleLink` gains `myRole: CoupleRole | null` and
  `partnerRole: CoupleRole | null`.
- `coupleWallpaperId` → `couplePackId` throughout (state shape,
  `setCoupleSettings` patch shape, exported selector hook).
- New selector `useMyRole()` so subscribers re-render only when their
  own role changes.

### Screen updates

- **`app/couple/setup.tsx` — GENERATE flow:**
  1. Horizontal scrollable pack picker (each card shows the 160px
     triptych: solo-A | together | solo-B).
  2. Two role cards underneath, image-backed, labels resolved from
     the chosen pack ("Boy" / "Girl", or "Sun" / "Moon", …). Tap one
     to pick your side.
  3. Tap Generate (Couple-Premium gated). Code reveal includes the
     chosen pack name + your role label as a meta line.
- **`app/couple/setup.tsx` — ACCEPT flow:**
  Adds an optional 3-chip row: `Auto / Side A / Side B`. Default is
  Auto (server gives you whichever side the creator didn't take).
  Manual override available — collides safely with `ROLE_TAKEN` if
  the user tries to grab the creator's side.
- **`app/couple/dashboard.tsx`:**
  - Partner card surfaces both role labels (`You: 👦 Boy · Them: 👧
    Girl`) and the partner's role emoji next to their name.
  - "Active wallpaper" card reads `pickImageForState` directly,
    showing the togethr image on `near` or the user's role-specific
    solo on `far`. Caption: "Together — both phones" vs
    "Solo (Boy)" using the resolved label.
  - Single-image picker REPLACED by a vertical list of full-width
    pack tiles, each rendering the triptych preview + the two role
    labels as a meta line ("Boy · Girl" or "Sun · Moon").
- **`app/couple/preview.tsx`:**
  - Left card = MY solo (not partner's), with copy that explains the
    composition ("Your phone shows this when you're apart. Your
    partner's phone shows their `<partnerLabel>` half").
  - Right card = together.
  - Below: a smaller informational row showing the PARTNER's solo
    half, captioned "Applied on `<their name>`'s phone right now if
    you're apart" — read-only, never applied locally.

### What WASN'T changed

- The native location task (`lib/coupleLocation.ts`) — pack-agnostic,
  unchanged.
- The Couple tab banner router (`app/(tabs)/couple.tsx`) — unchanged.
- `lib/coupleBootstrap.ts` realtime + linked-mode lifecycle — only
  augmented (precache + pack-swap reactions added).
- `store/settings.ts` `isCouplePremium` flag — unchanged.

## Files changed

NEW:
- `constants/couplePacks.ts` — pack catalog + helpers
- `supabase/couple_schema_v2_packs.sql` — additive migration
- `changes/078-couple-packs-and-roles.md` — this file

MODIFIED:
- `store/couple.ts` — `myRole` / `partnerRole` / `couplePackId`
- `lib/couple.ts` — role + pack args throughout RPC + helpers
- `lib/coupleWallpaper.ts` — `pickImageForState`-driven apply +
  precache helper
- `lib/coupleBootstrap.ts` — precache on link + pack-swap reaction
- `app/couple/setup.tsx` — pack picker + role picker (both flows)
- `app/couple/dashboard.tsx` — pack tiles + role-aware labels
- `app/couple/preview.tsx` — my-solo + together + partner-solo info
- `changes/README.md` — index row

## Verification

JS-only change (no native rebuild needed beyond the changes/077 build
which has already shipped). Pure Metro reload OR re-run `r` in the
Expo CLI session.

1. **Run the v2 SQL.** Open Supabase SQL editor, paste
   `supabase/couple_schema_v2_packs.sql`, run. Idempotent.

2. **Schema sanity:**
   ```sql
   -- as user A
   select public.create_couple('a', 'classic-proposal');  -- LOVE-XXXX
   select creator_role, partner_role from public.couples
     where creator_id = auth.uid();   -- creator_role = 'a', partner_role = null
   -- as user B
   select * from public.accept_couple_code('LOVE-XXXX', null);
     -- partner_role auto-assigned to 'b'
   -- try to grab creator's role explicitly:
   select * from public.accept_couple_code('LOVE-XXXX-2', 'a');
     -- raises ROLE_TAKEN
   ```

3. **End-to-end on two devices:**
   - Device A → Couple tab → "Pair your couple" → /couple/setup.
   - Pick a pack (e.g. Sun & Moon). Pick your side (Sun ☀️ or Moon
     🌙). Generate. Code reveal shows "You · Sun & Moon · Sun ☀️".
   - Share code to Device B.
   - Device B → /couple/setup → enter code → leave Side on Auto →
     Link. Toast "💕 Linked".
   - Dashboard on both sides shows partner card with the resolved
     labels: A reads "You: ☀️ Sun · Them: 🌙 Moon", B reads
     mirrored.
   - Walk apart → both phones swap to their respective role-solo
     image from the Sun & Moon pack. Walk back → both swap to the
     together image.

4. **Pack swap mid-flight:**
   - On Device A's dashboard, tap a different pack tile (e.g. Yin
     & Yang).
   - Toast "✓ Pack switched" on A. Device B's "On your screen now"
     row updates within ~1 s via realtime, labels flip to "Yin /
     Yang" instantly.
   - Walk-apart / walk-near again — new pack's images apply. Sides
     stayed the same (role 'a' is still role 'a', just with the
     new label).

5. **Role-collision guard:**
   - Force-test: Have Device B re-enter a fresh code with the same
     side the creator took (use the dev RPC console if needed).
     Toast surfaces "Your partner already chose that side — pick
     the other one."

6. **Couple Premium inheritance:** unchanged from changes/077 —
   partner still auto-unlocks on link.

## Notes

- **No breaking changes for the v1 DB.** Both new columns are
  nullable, both new RPC args have defaults, the old
  `couple_wallpaper_id` column stays in place. A user who linked
  under v1 keeps working — their `creator_role` / `partner_role`
  read as null, the `getCouplePack(null)` helper falls back to the
  first pack (Classic Proposal), and the proximity apply uses role
  'a' for both sides until they swap packs on the dashboard. Not
  ideal but functional, and the next pack swap fixes it implicitly
  because the new pack write doesn't touch roles.
- **Backfill suggestion (optional).** If you want to clean up v1
  rows, run:
  ```sql
  update public.couples
    set creator_role = 'a', partner_role = 'b'
    where creator_role is null and partner_role is null
      and status = 'linked';
  ```
- **Labels live on the pack on purpose.** This is the bit that makes
  "neutral" work without making the UI generic. The pack artist
  decides whether their pack is gendered (Boy/Girl), elemental (Sun/
  Moon), positional (Left/Right), conceptual (Yin/Yang), or
  whatever. Adding a new pack with new labels is a single entry in
  `couplePacks.ts` — no schema migration, no UI changes.
- **Auto-assignment on Accept is the cleanest UX.** Most partners
  shouldn't have to think about sides — the creator already picked,
  the accepter gets the opposite. The explicit override (Side A /
  Side B chips) exists for the edge case where the partner wants to
  swap (rare but possible — easier to override at link time than
  later).
- **Future: AI-generated packs.** The AI tab already exists. A
  natural extension is to let users generate their own 3-image pack
  via the AI flow and store it in Supabase Storage. The triptych
  shape stays the same; only the image source changes. Out of scope
  for this change but the data model is ready.
