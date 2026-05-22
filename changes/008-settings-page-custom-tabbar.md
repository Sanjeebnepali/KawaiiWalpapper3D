# Full Settings page + custom elevated-center tab bar

**Date:** 2026-05-14
**Type:** feature

## Problem

Brief asked for a complete Settings/Profile page matching a screenshot (7 sections, toggles, dropdowns, a slider, logout), plus a restructured bottom tab bar (Generate / Gallery-center-elevated / Settings) and a Home tweak (profile avatar → Settings).

Prior state: `profile.tsx` was a basic profile screen; the tab bar was a standard 3-tab bar (Wallpapers / AI Generator / Profile). Home, palette, and routing were already done (changes 003/005/006/007).

## Decisions

- **Slider: custom `PanResponder` build, not a native dep.** The brief implies a slider component; `@react-native-community/slider` is a native module → forces an `expo run:android` rebuild, and react-native-gesture-handler + reanimated worklets have been this project's most fragile area (changes 001/002). `PanResponder` + core RN is zero-dep, zero-rebuild, zero-worklets-risk, and smooth enough for a settings control.
- **Reanimated stays v4.** Brief said "reanimated v3" — declined again (re-breaks the worklets 0.7.x assertion; established in 001 + 007).
- **Navigation stays Expo Router.** Brief said "@react-navigation/native-stack + bottom-tabs" — Expo Router *is* those under the hood (established in 007). The custom tab bar is supplied via `<Tabs tabBar={...}>`, which is the supported Expo Router seam — no migration.
- **Dropdowns use `Alert`-based pickers**, not custom modal pickers. The brief says "opens theme picker" etc.; a native `Alert` action sheet is functional, zero-dep, and platform-correct. Full custom picker modals are a follow-up if richer UI is needed.
- **Toast: `ToastAndroid` on Android, `Alert` on iOS.** RN has no cross-platform toast; this is the standard split.
- **WebView links → `Linking.openURL`.** Brief says "opens WebView" for Terms/Privacy. `react-native-webview` is another native module + rebuild; opening in the system browser is the no-new-dep choice. Swap to a WebView screen later if in-app rendering is required.
- **Settings state: new Zustand store** (`store/settings.ts`), mirroring `store/favorites.ts`. In-memory; persistence is a noted follow-up.

## Solution

### New files

- **`store/settings.ts`** — Zustand store holding all ~12 settings values with spec defaults (Auto Download OFF, Save to Gallery ON, resolution 4K, maxGenPerDay 50, etc.) and a typed `set(key, value)` updater.
- **`components/Slider.tsx`** — `PanResponder`-driven slider. Track width captured via `onLayout`; `valueToX` / `xToValue` map between value and thumb position; tap-to-jump on grant, drag via `dx`. `value`/`onChange` held in refs so the once-created PanResponder closure never goes stale. Pink fill, white 22px thumb, `#666666` inactive track.
- **`components/SettingsControls.tsx`** — reusable primitives so `profile.tsx` stays declarative:
  - `SettingsSection` — uppercase grey header + `#1E1E1E` rounded card.
  - `SettingsRow` — label (+ optional subtitle / left icon / `danger` red styling), a `right` slot for any control, optional `onPress` (becomes a `Pressable`), and a `divider` prop (`#333333` bottom line; pass `false` on each section's last row).
  - `Toggle` — RN `Switch` pre-wired with pink-on / `#666666`-off.
  - `RowValue` — the "value + chevron" right-slot, `chevron` variants `forward` / `down` / `external`.
- **`components/CustomTabBar.tsx`** — custom `tabBar` for `<Tabs>`. Fixed visual order `['ai','index','profile']` → Generate / Gallery / Settings regardless of `<Tabs.Screen>` declaration order. Side tabs are icon+label (pink active, `#B0B0B0` inactive). The center "Gallery" tab is an elevated 58px pink rounded button (`marginTop: -22` lifts it above the bar) with a dark icon. `useSafeAreaInsets()` → `height = 64 + bottomPad`, `paddingBottom = bottomPad`. Uses the canonical `navigation.emit('tabPress')` → `navigate` pattern.

### Rewritten / edited

- **`app/(tabs)/profile.tsx`** — full Settings screen. Header ("Settings" + pencil edit stub). Profile block (96px pink-glow avatar ring, "Kawaii User", "user@kawaii.com"). Seven `SettingsSection`s — Account / Wallpaper / AI Generator / Notification / Privacy & Legal / About — composed from the control primitives, plus the slider cell for Max Generation Per Day. Logout pill (outline, pink border). Handlers: `pickOption` (Alert picker) for theme/resolution/quality; `toast` for Clear Cache; `Share.share` for Export Data (favorites → JSON) and Share App; `Linking.openURL` for Terms/Privacy/Rate Us and `mailto:` Contact Support; destructive `Alert` confirms for Delete Account and Logout. App version from `expo-constants`.
- **`app/(tabs)/_layout.tsx`** — reduced to `<Tabs screenOptions={{headerShown:false}} tabBar={props => <CustomTabBar {...props} />}>` with the three `Tabs.Screen`s. All bar styling/ordering now lives in `CustomTabBar`.
- **`components/Header.tsx`** — profile avatar button now `router.push('/profile')` (switches to the Settings tab).
- **`constants/theme.ts`** — added `error: '#ffb4ab'` (from DESIGN.md) for the Delete Account red text/icon.

## Files changed

- `store/settings.ts` — **new**
- `components/Slider.tsx` — **new**
- `components/SettingsControls.tsx` — **new**
- `components/CustomTabBar.tsx` — **new**
- `app/(tabs)/profile.tsx` — rewritten as the full Settings page
- `app/(tabs)/_layout.tsx` — switched to the custom `tabBar`
- `components/Header.tsx` — profile avatar → Settings tab
- `constants/theme.ts` — added `error` token
- `CLAUDE.md` — updated tab bar + state/store sections

## Verification

- `npx tsc --noEmit` → exit 0 (zero type errors).
- Runtime not yet verified on device — the app's run-state was already unverified going into this change (see note below). Needs `npx expo start --clear` + a device pass.

What to check on device:
- Bottom bar shows Generate (left) / Gallery (center, raised pink button) / Settings (right); active tab is pink.
- Settings tab: all 7 sections render in cards with grey uppercase headers and `#333` dividers between rows; toggles are pink when on; the Max Generation slider drags and the value updates live; dropdown rows open an Alert picker and the chosen value shows in the row; Logout / Delete Account open confirm dialogs; Export Data opens the share sheet with favorites JSON.
- Home: tapping the top-right profile avatar jumps to the Settings tab.

## Notes

- **App run-state is still unverified.** Changes 005–008 were all built without a confirmed on-device run; `tsc` passing rules out type errors but not bundling/runtime/layout issues. A device pass is overdue.
- Settings + favorites stores are **in-memory** — both reset on app restart. Add `zustand/middleware` `persist` + `@react-native-async-storage/async-storage` when persistence is needed (native module → rebuild).
- "Edit profile" (pencil) is an `Alert` stub — no edit mode UI yet.
- Terms/Privacy open the system browser, not an in-app WebView (see Decisions). Export Data shares raw JSON text; a real file export would use `expo-file-system` + `expo-sharing`.
- Brief's Part 2 again said home preview cards are "48% of screen width" while also "4 cards in a row" — physically impossible; kept the existing 4-per-row layout (same call as change 006).
- The "Settings uses its own tab bar / tab bar hidden" line in the brief was contradictory — treated Settings as a normal tab showing the standard custom bar.
