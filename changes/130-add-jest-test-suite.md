# Add a unit-test suite (Jest + jest-expo)

**Date:** 2026-05-24
**Type:** chore + test

## Problem

The repo had no test framework, so behaviour changes (including the big file-size refactor
in changes 118–129) could only be verified at the type level (`tsc`) + manual device runs.
The owner asked to close that gap.

## Solution

Wired up the Expo-standard test stack and a starter suite over pure logic — which also
retroactively validates the helpers the refactor extracted.

- **Deps (devDependencies, `--legacy-peer-deps`):** `jest-expo@55.0.18` (SDK-55 aligned),
  `jest@29.7.0`, `@types/jest`.
- **`jest.config.js`:** `preset: 'jest-expo'` (so TS/JSX uses `babel-preset-expo`, same as
  the bundle), `testMatch` = `**/__tests__/**/*.test.ts?(x)`, ignores `node_modules`/`android`/`ios`/`.expo`.
- **Scripts:** `npm test` (`jest`) and `npm run test:watch`.
- **Starter tests (31 tests, 3 suites, all green):**
  - `store/__tests__/couple.geo.test.ts` — `haversineMeters` (zero/known-distance/symmetry) + `getBufferZone` (all accuracy bands, threshold scaling, 0.2–5× clamp).
  - `lib/__tests__/formatMoodTime.test.ts` — `formatTime` Today/Yesterday/older formats.
  - `components/moodHome/__tests__/helpers.test.ts` — `formatHour`, `formatMinutes`, `labelForSource`, `timeAgo`.

## Files changed

- `package.json` (+test deps, +test scripts), `package-lock.json`.
- `jest.config.js` (new).
- `store/__tests__/couple.geo.test.ts`, `lib/__tests__/formatMoodTime.test.ts`, `components/moodHome/__tests__/helpers.test.ts` (new).
- `CLAUDE.md`, `.claude/rules/execution-discipline.md`, `docs/rules-ondemand/code-writing-deep.md` — updated the "no test suite" notes to reference `npm test`.

## Verification

`npm test` → **Test Suites: 3 passed; Tests: 31 passed** (2.3 s). `npx tsc --noEmit`
unchanged (5 pre-existing errors, 0 new).

## Notes

- Scope is pure-logic unit tests — fast, no device, no native mocks. This is the highest-
  value, lowest-friction start and it exercises the refactor-extracted helpers.
- Next steps (not done here): component/render tests via `@testing-library/react-native`
  (needs React-19-compatible renderer wiring), and store-action tests with the
  AsyncStorage jest mock. Pure-logic coverage can also be grown incrementally.
