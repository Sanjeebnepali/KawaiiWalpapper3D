# Add babel-preset-expo and switch to worklets babel plugin

**Date:** 2026-05-14
**Type:** fix

## Problem

After the worklets pin was fixed (see `001`), the native build succeeded but the JS bundle returned HTTP 500 from Metro:

```
node_modules\expo-router\entry.js: Cannot find module 'babel-preset-expo'
Require stack:
- node_modules\@babel\core\lib\config\files\plugins.js
- ...
```

Two issues stacked on top of each other:

1. `babel.config.js` references `'babel-preset-expo'` but the package was not in `package.json`. Expo bundles its own copy under `node_modules/expo/node_modules/babel-preset-expo`, but Metro's transform worker resolves it from the project root (`node_modules/babel-preset-expo`) and fails when it isn't there.
2. `babel.config.js` listed the plugin as `'react-native-reanimated/plugin'`. In Reanimated 4 that plugin moved into the worklets package — the correct path is `'react-native-worklets/plugin'`. The old path resolves to nothing, silently skipping worklet compilation.

## Solution

- Add `babel-preset-expo: ~55.0.0` to `devDependencies` (matches Expo SDK 55 — Expo aligned the preset version with the SDK number).
- Change the babel plugin name in `babel.config.js`.

## Files changed

- `package.json` — added `"babel-preset-expo": "~55.0.0"` to `devDependencies`
- `babel.config.js` — `'react-native-reanimated/plugin'` → `'react-native-worklets/plugin'`

Final `babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
```

## Verification

```powershell
npm install --legacy-peer-deps

# Confirm package now resolves at project root, not just under expo/
Get-Content node_modules\babel-preset-expo\package.json | Select-String '"version"'
#   "version": "55.0.21",

# Confirm worklets plugin path exists
Test-Path node_modules\react-native-worklets\plugin
#   True
```

Then start Metro fresh (see Notes). Bundle should succeed with a `Bundled <ms>` line.

## Notes

- Critical follow-up: a Metro worker started **before** this fix will keep returning the cached "module not found" 500 even after the install. Killing the process holding port 8081 is required. See `changes/README.md` link to the Metro stale-worker recovery in CLAUDE.md.
- `~55.0.0` is the right range for Expo SDK 55. If/when the project upgrades to SDK 56+, bump this in lockstep.
