# Split 3 screens under the cap (theme-packs, profile, couple/setup)

**Date:** 2026-05-24
**Type:** refactor

## Problem

Three Expo Router screens were over the 300 soft cap: `app/wallpapers/theme-packs.tsx`
(897), `app/(tabs)/profile.tsx` (842), `app/couple/setup.tsx` (702). Batch B (screens)
of the file-size campaign. Done by sub-agents in parallel, verified centrally.

## Solution

PURE presentational extraction only — `StyleSheet.create` blocks and self-contained
sub-components (props only, no hooks moved), plus pure module-level data/helpers. Every
screen keeps its `export default` route; no hook call was moved and no hook order
changed; all extracted files live OUTSIDE `app/` so no new routes are created.

- **theme-packs.tsx 897→284** — styles → `components/themePacks/styles.ts`; sub-components `ThemePacksHeader`/`SectionHeader`/`ActiveBanner`/`PackCard`/`UserCollectionRow`; pure data → `lib/themePackHeroes.ts`; delete handler → `lib/themePackActions.ts` (deps passed as params).
- **profile.tsx 842→262** — styles → `components/settings/styles.ts`; sections → `components/settings/{PreferenceSections,AiTokenSheetBody,PrivacyAboutSections,ProfileHeader,LibraryAccessSections}.tsx`; handler factories → `lib/settingsActions.ts`; constants → `lib/settingsConstants.ts`.
- **couple/setup.tsx 702→264** — styles → `components/coupleSetup/styles.ts`; cards → `components/coupleSetup/{GenerateCard,AcceptCard,RestoreBanner}.tsx`.

## Files changed

3 screens trimmed + new files under `components/{themePacks,settings,coupleSetup}/` and
`lib/{themePackHeroes,themePackActions,settingsActions,settingsConstants}.ts`.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 new**. (One
transient ref-type error from a sub-component prop was fixed during verification.)
Behaviour-preserving; JS only.

## Notes

- Campaign progress: 17 / ~35 files done (14 logic + these 3 screens).
- `app/shuffle/[id].tsx` (1047) was attempted in this batch but the only way under 300
  required lifting its hooks into a custom hook, which changed `useCallback` dependency
  arrays + hook execution order — a behavioural change that can't be verified safe
  without tests. Per the "don't break logic" rule it was REVERTED to the original and is
  deferred for a careful, purely-presentational pass (it may remain a justified exception
  if hook-heavy residual can't be reduced safely).
- Confirmed approach for remaining screens: PURE presentational extraction only (styles +
  props-only sub-components). Never move hooks or change dependency arrays. Hook-heavy
  residuals stay as documented exceptions rather than risk behaviour.
