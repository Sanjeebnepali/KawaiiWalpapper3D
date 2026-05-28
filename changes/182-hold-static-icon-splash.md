# Hold the static icon splash so it's visible

**Date:** 2026-05-29
**Type:** fix (follow-up to 181)

## Problem

Change 181 removed the JS `AnimatedSplash` and pointed the native splash at the
app icon. But `AnimatedSplash` was also the only caller of
`SplashScreen.preventAutoHideAsync()` — so with it gone, the native splash
reverted to Expo's **default auto-hide**, which dismisses the moment the first
React frame is ready. On a fast/warm launch that's near-instant, so the app
"opened directly without a splash icon" — the owner never got to see it, and
they wanted the splash/loading screen kept (just without the animation).

## Solution

Re-introduced minimal splash control in `app/_layout.tsx` — no animation, no
poster, just hold the existing static icon splash for a beat:

- `SplashScreen.preventAutoHideAsync()` at module load keeps the native splash
  (the app icon on `#000000`, configured via the `expo-splash-screen` plugin in
  `app.json`, change 181) on screen.
- A `useEffect` calls `SplashScreen.hideAsync()` after `SPLASH_HOLD_MS` (2000 ms,
  a named const) to reveal the app. Fixed hold rather than "hide when ready"
  because the store hydration in the sibling effect is fire-and-forget and
  finishes in milliseconds — hiding on ready would flash the splash away again.

Net launch sequence: native app-icon splash (held ~2 s) → app. Static, no
animation — which is what the owner asked for.

## Files changed

- `app/_layout.tsx` — added `expo-splash-screen` import, `preventAutoHideAsync()`
  at module load, `SPLASH_HOLD_MS` const, and a `useEffect` that `hideAsync()`
  after the hold.

## Verification

- `npx tsc --noEmit` → **exit 0**.
- Release APK rebuilt + installed on device (V2231): **BUILD SUCCESSFUL in
  2m 21s**, `app-release.apk` installed.

## Notes

- **JS-only** change — the native splash resources (app icon + black background)
  are unchanged from change 181; the release rebuild just re-embeds the JS
  bundle. No prebuild needed.
- To change how long the icon shows, edit `SPLASH_HOLD_MS` in `app/_layout.tsx`.
