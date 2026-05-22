# Homescreen header: show user's profile avatar

**Date:** 2026-05-19
**Type:** feature (UX)

## Problem

User: "in homescreen there is profile icon what i want user already
select profile pic while loging it already set in setting page but
i want to set same in homescreen page also."

The homescreen header (`components/Header.tsx`) was rendering a
static `<Ionicons name="person" />` regardless of whether the user
had picked an avatar during profile-setup (change 044). The
Settings page already shows the selected avatar correctly via
`getAvatar(profile.avatar_id)`. Two surfaces of the same user
identity disagreed — Settings personalised, homescreen generic.

## Solution

`components/Header.tsx` now reads `profile` from
`useAuthStore` and renders the same colored-circle + emoji combo
the Settings page does, with a graceful fallback to the generic
person icon for guests / unauthed users.

### Wiring

- Imported `getAvatar` from `constants/avatars` and
  `useAuthStore` from `store/auth`.
- Read `profile` via a Zustand selector
  (`useAuthStore((s) => s.profile)`) so the header re-renders the
  moment the user changes avatar in profile-setup. The `memo` HOC
  on the Header still works — Zustand subscriptions live inside
  the hooked function and aren't gated by the memo equality.
- `avatar = profile?.avatar_id ? getAvatar(profile.avatar_id) : null`
  resolves the visual or returns null. Single source-of-truth.

### Rendering

- The 40×40 `profileBtn` keeps its tap target so the hitbox
  doesn't shift between guest/authed states.
- When `avatar` is set, the surface bg + border on the outer
  button drop to `transparent` / `0` (the avatar circle below
  owns the visual). When not set, the original guest styling
  (Colors.surface + Colors.border) is preserved.
- Inner `avatarCircle` is 36×36 with `avatar.color` background,
  a primary-color shadow halo (matches the Settings avatar ring
  vibe at smaller scale), 18 dp radius. 20 dp emoji centred.
- The cyan unread `dot` indicator still sits on top of both
  states.

### Why a 36×36 inner circle inside a 40×40 button

Visual breathing room. A flush 40×40 avatar with no surrounding
margin reads as "stuck to the edge" of the header. Two-dp inset on
each side gives the avatar a clear edge without shrinking the
touch target.

## Files changed

- `components/Header.tsx` — `useAuthStore` + `getAvatar` imports,
  selector read, conditional avatar render, new styles for
  `avatarCircle` and `avatarEmoji`.
- `changes/README.md` — index row.

## Verification

JS-only — `run` to rebuild.

After install:

1. **Authed user with avatar:**
   - Open the app while signed in with an avatar set (e.g.
     bunny / star / heart from change 044's profile setup).
   - Homescreen header shows a colored circle with your chosen
     emoji glyph in the top-right (where the generic person icon
     used to live).
   - The same emoji + color appears on the Profile tab (Settings).
2. **Change avatar test:**
   - Profile → Edit profile → pick a different avatar → save.
   - Return to home tab. Header avatar updates without a manual
     reload — Zustand selector re-render.
3. **Guest user:**
   - Sign out (or fresh install).
   - Header reverts to the generic `person` icon on
     `Colors.surface` background — no broken state.

## Notes

- **No backend call.** This change is purely a render-side fix.
  The avatar id is already in `useAuthStore.profile.avatar_id`
  and was being read in Settings; we just added a second
  consumer.
- **Memoization preserved.** `Header` is still wrapped in `memo`.
  The Zustand selector inside subscribes to store changes
  independently of React's memo equality check, so updates flow
  through.
- **No platform branch.** Same code path on iOS / Android.
- **Future:** if we ship real avatar images later (PNG / SVG),
  the only edit needed is in `constants/avatars.ts` (or the
  resolver). Header / Settings both consume `getAvatar(id)` so
  they'll pick up the new visual automatically.
