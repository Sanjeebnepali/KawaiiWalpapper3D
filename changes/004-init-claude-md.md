# Add CLAUDE.md

**Date:** 2026-05-14
**Type:** docs

## Problem

No `CLAUDE.md` existed. Future Claude Code sessions would have to re-discover the load-bearing dependency pins and re-trip the same Metro stale-worker pitfall we hit twice during this session.

## Solution

Wrote `CLAUDE.md` at the project root focused on:

- The dependency pins that are load-bearing: worklets 0.7.x ↔ Reanimated 4.2.1, `babel-preset-expo` at root, `react-native-worklets/plugin` (not the Reanimated path).
- Why `--legacy-peer-deps` is mandatory and not a thing to "fix" by bumping React.
- Step-by-step Metro stale-worker recovery (find PID on 8081, kill, wipe caches, restart).
- High-level architecture: routing layout, theme/mockData layering, the deterministic `pic(seed)` URL trick, glass-morphism layering pattern, `useWindowDimensions` rule.

Skipped generic advice (commit hygiene, test-writing) and avoided enumerating every file — those are discoverable.

## Files changed

- `CLAUDE.md` — **new**

## Verification

Open `CLAUDE.md` and confirm it has Project, Commands, Critical dependency pins, npm install peer-dep conflict, Metro stale-worker gotcha, and Architecture sections.

## Notes

If a dependency pin in `package.json` changes meaningfully (worklets, Reanimated, Expo SDK, babel-preset-expo, react/react-dom), update the "Critical dependency pins" section in `CLAUDE.md` in the same change.
