# 101 — Home top-tabs tap fix + Sleep/Wake vs driver audit

## Problem

Owner reported two things:

1. **Home top tabs are hard to tap after scrolling.** "When I scroll the home
   page and then try to click 2D Kawaii / Dual / Theme Packs, this stacked tab
   is so hard to navigate and click."

2. **Background-driver behaviour check.** "Check that only Sleep/Wake runs in
   the background when I choose Theme Pack or Mood Based (not other), and that
   Sleep/Wake doesn't affect Theme Pack and Mood Based. If you find a problem,
   fix it."

## Investigation & fix

### Issue 1 — top tabs (FIXED)

`app/(tabs)/index.tsx` rendered `Header` + `TopTabs` as the FlatList's
**sticky `ListHeaderComponent`** (`stickyHeaderIndices={[0]}`). `TopTabs` is a
horizontal `ScrollView` of `Pressable`s. On Android, a horizontal scroller of
pressables nested inside a sticky header drops/steals taps right after a
vertical scroll — the sticky view is re-parented/overlaid and its nested
scroll responder competes with the just-settled list scroll. Net effect: tab
taps don't register reliably after scrolling.

Two-part fix:

- **Moved `Header` + `TopTabs` out of the FlatList** into a fixed sibling
  `View` (`styles.topBar`) above the list, and gave the FlatList `flex: 1`.
  Visually identical (the header was already pinned at index 0), but the tabs
  are no longer inside a sticky/virtualized header, so taps are decoupled from
  the list's scroll responder. Removed `ListHeaderComponent`,
  `stickyHeaderIndices`, the `ListHeader` memo, the `STICKY` const, and the
  `stickyHead` style.
- **Enlarged the tab touch targets** in `components/TopTabs.tsx`: each
  `Pressable` gets `hitSlop={{top:12,bottom:12,left:14,right:14}}` +
  `android_ripple` (tactile feedback); the tab gains `paddingTop` /
  `paddingHorizontal` (was only `paddingBottom`, so the hit area was just the
  label height). Row `gap` trimmed `xl → md` to offset the new horizontal
  padding so spacing looks the same.

### Issue 2 — Sleep/Wake vs drivers (AUDITED, ALREADY CORRECT — no change)

Traced the full automation path; the requested behaviour is already
implemented:

- `lib/automationMode.ts` defines exactly three **mutually-exclusive drivers**:
  `theme` (Theme Pack shuffle), `mood` (Mood Based), `friend` (Friend
  check-in). `DRIVERS = ['theme','mood','friend']`. Sleep/Wake and the daily
  reminder are documented as **layers**, intentionally never in this set.
- Enabling Theme Pack (`useShuffleStore` activate → `moodBootstrap.ts:443-448`)
  or Mood Based (`moodBootstrap.ts:277-284`) calls `enforceSingleDriver(...)`,
  which stops the *other two drivers* (and their foreground services) but never
  touches `sleepWakeEnabled`.
- `onToggleSleepWake` (`app/(tabs)/mood.tsx:557`) only flips `sleepWakeEnabled`
  — it never calls `enforceSingleDriver` and never stops Theme Pack/Mood Based.
- OS background-task registration counts `sleepWakeEnabled` independently
  (`moodBootstrap.ts:300-310` and `492-498`), so turning a driver off doesn't
  unregister the dispatch Sleep/Wake still needs.
- `runMoodBackgroundOnce` (`lib/moodBackgroundTask.ts`) runs the shuffle tick,
  then the Sleep/Wake fallback, then the mood path — each gated by its own
  flag. Because the three drivers are mutually exclusive, at most one driver +
  Sleep/Wake ever runs per dispatch.

Conclusion: Sleep/Wake already coexists with whichever driver is active and
does not disable it; choosing Theme Pack/Mood Based stops the *other drivers*
(incl. Friend check-in) but not Sleep/Wake. No code change made.

Two notes surfaced for the owner (not bugs):
- The **daily mood reminder** (`notifEnabled`) is also a coexisting layer — it
  sends a notification (no wallpaper change) and is NOT stopped by a driver. If
  it should be suppressed while a driver is active, that's a separate product
  call.
- **Couple proximity** is deliberately excluded from the exclusive set
  (account-bound / GPS, cross-partner side effects) per `automationMode.ts`.

## Files changed

- `app/(tabs)/index.tsx` — Header+TopTabs moved out of the sticky FlatList
  header into a fixed top bar; FlatList `flex:1`; styles updated.
- `components/TopTabs.tsx` — bigger tap targets (hitSlop, padding,
  android_ripple); row gap trimmed.

## Verification

- `npx tsc --noEmit` — no errors in the changed files.
- Manual (after release build): scroll the home page, then tap 2D Kawaii /
  Dual / Theme Packs — should navigate on the first tap. Header stays pinned.

## Notes

- JS-only — no native deps. Needs a release-APK rebuild (`run`) for the owner
  to see it, since they run the JS-embedded release build, not Metro.
