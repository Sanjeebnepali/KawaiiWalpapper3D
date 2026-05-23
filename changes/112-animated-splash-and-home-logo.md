# Animated splash screen + home header logo

**Date:** 2026-05-24
**Type:** feature

## Problem
The owner supplied two brand assets — a square app-icon logo (detective girl) and a 900×1600 "KawaiiGirl" splash artwork — and asked for an animated loading splash: full-screen art, a 3-heart + scanning magnifying-glass loader at the bottom, an entrance/exit sequence, and the logo placed on the home header.

## Solution
Built a JS animated splash overlay adapted to this app's real stack (Expo Router + Reanimated v4 + TypeScript + `expo-image`), since the requested `src/screens` + React Navigation structure would be dead code here.

- **Assets:** the JPEG splash was converted to `assets/splash-kawaii.png`; the logo copied to `assets/logo-kawaii.png`.
- **Overlay, not a route:** `AnimatedSplash` is mounted as the last child of `app/_layout.tsx`, so it covers the whole app on cold start and fades away to reveal the already-routed `(tabs)` — no navigation call needed.
- **Sequence:** native splash (solid brand colour, no white flash) → `SplashScreen.hideAsync()` hands off to JS → image fades in 800ms with a subtle 0.94→1.0 bounce → hearts/glass group fades in → glass scans the 3 hearts infinitely → on load all hearts brighten + glass spins 360° → screen fades out 500ms. Always dismisses between **2000ms (min)** and **5000ms (max)**.
- **Scanning loader:** a single continuous `position` shared value sweeps 0→1→2→1→0 (600ms travel, 400ms pause, `Easing.inOut(Easing.ease)`) with a simultaneous ±6px / 1000ms vertical float. Both the glass translateX AND each heart's highlight read that one value, so the hearts light up in lock-step with **zero JS-thread state changes** (no re-renders, runs on the UI thread — meets the 60fps/perf requirement better than an `activeIndex` prop would).
- **Hearts:** white Ionicons heart with a pink (`#FF9EBC`) overlay that cross-fades in (dim 40% / scale 1.0 → bright 100% / scale 1.2) plus a soft pink glow halo at 30% — all interpolated from `position`.
- **Magnifying glass:** built from Views (gold lens ring + handle + white heart inside + drop shadow) so no bespoke PNG is needed and it can be tinted/spun freely.
- **Error handling:** a brand gradient sits behind the image and is the fallback if `expo-image` `onError` fires; the MAX_MS timer guarantees the splash always dismisses even if an animation stalls. All shared-value animations and timers are cancelled/cleared on unmount.
- **Home logo:** `components/Header.tsx` now renders `logo-kawaii.png` (via `expo-image`) inside the existing 40×40 rounded, shadowed container, replacing the gradient + smiley icon.
- **app.json:** added the `expo-splash-screen` plugin with `backgroundColor: #c79cc9` so the pre-JS native splash is on-brand (lets the JS image fade in over it instead of a white flash).

## Files changed
- `assets/splash-kawaii.png`, `assets/logo-kawaii.png` — new brand assets.
- `lib/animations/useMagnifyAnimation.ts` — glass scan + float + drop-in + exit-spin; drives the shared `position`.
- `lib/animations/useHeartAnimation.ts` — `useHeartStyles(index, position, finishing)` → container/pink/glow styles.
- `components/splash/LoadingHearts.tsx` — 3 hearts + View-built magnifying glass; exact spacing/sizes.
- `components/splash/AnimatedSplash.tsx` — full-screen image, entrance/exit sequence, min/max timing, gradient fallback, native-splash handoff.
- `app/_layout.tsx` — mounts `<AnimatedSplash>` as the top overlay, dismissed via state.
- `components/Header.tsx` — logo image in place of the gradient icon.
- `app.json` — `expo-splash-screen` plugin backgroundColor.

## Verification
- `npx tsc --noEmit` — no new errors (only the 5 pre-existing unrelated `as Href` / native-module typings remain).
- **Requires a native rebuild** (`npx expo run:android` / the `run` shortcut) because `app.json` changed — a JS-only reload will not apply the native splash colour. On launch: art fades in, glass scans the hearts, hearts pulse pink under it, then it fades to the home screen with the new logo in the header.

## Notes
- The splash artwork has the character, "KawaiiGirl" name, tagline, and a static heart graphic **baked into the single flat image**, so those layers can't be animated independently (no separate transparent assets). The whole image fades/bounces in as one layer; a bottom scrim masks the baked static hearts so the LIVE animated hearts read cleanly.
- Spec deviations (all intentional, project-fit): Reanimated **v4** not v3 (CLAUDE.md pins v4; the v3 API used here is identical on v4); no `useNativeDriver`/Lottie (Reanimated already runs on the UI thread); files live under `components/splash` + `lib/animations` instead of `src/`.
