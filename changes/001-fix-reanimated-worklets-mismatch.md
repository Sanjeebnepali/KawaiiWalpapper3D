# Fix Reanimated / Worklets version mismatch

**Date:** 2026-05-14
**Type:** fix

## Problem

Android `assembleDebug` failed at the gradle task `:react-native-reanimated:assertWorkletsVersionTask`:

```
[Reanimated] Your installed version of Worklets (0.8.3) is not compatible
with installed version of Reanimated (4.2.1). Please install the latest
supported version of Worklets 0.7.x or older.
```

`react-native-worklets` was being auto-resolved to its latest (0.8.3) because nothing pinned it. Reanimated 4.2.1's `scripts/worklets-version.json` declares `min: 0.7.0`, `max: 0.7`, so anything in 0.8.x fails the assertion at build time.

## Solution

Explicitly add `react-native-worklets` to `package.json` dependencies pinned to the 0.7 range. After install it resolved to 0.7.4, which satisfies the assertion.

## Files changed

- `package.json` — added `"react-native-worklets": "~0.7.0"` to `dependencies`

## Verification

```powershell
# 1. Confirm the pinned version installed
Get-Content node_modules\react-native-worklets\package.json | Select-String '"version"'
#   "version": "0.7.4",

# 2. Clean android build cache (the old assertion result is cached)
.\android\gradlew.bat -p android clean

# 3. Run the build
npx expo run:android
```

The `assertWorkletsVersionTask` should pass and the build should proceed.

## Notes

- `npm install` requires `--legacy-peer-deps` due to an unrelated `react@19.2.0` vs `react-dom@19.2.6` peer conflict — see CLAUDE.md.
- Do NOT bump worklets to 0.8.x without simultaneously bumping Reanimated to a version that supports it. Check `node_modules/react-native-reanimated/scripts/worklets-version.json` after any Reanimated upgrade to confirm the supported range.
