# Code-writing — deep rulebook (load on demand)

NOT auto-loaded. Read this explicitly at the start of any non-trivial coding task.
It expands the always-active [`.claude/rules/code-writing.md`](../../.claude/rules/code-writing.md).

## Naming

- Names state intent, not mechanics: `pickPhotoForMood`, not `getData`.
- A boolean reads as a predicate: `isPremium`, `hasFace`, `moodModeEnabled`.
- No abbreviations except established ones (`id`, `ref`, `props`, `nav`).
- If you must comment what a name means, the name is wrong — rename it.
- Components are PascalCase; hooks are `useX`; stores are `useXStore`.

## Function design

- One function, one job. If the name needs "and", split it.
- ≤40 lines target, 80 hard cap. Over 80 → extract.
- ≤4 params; beyond that take an options object. No boolean flag params.
- Early-return to keep nesting ≤3. Guard clauses over nested `if`.
- Pure where possible; isolate side effects (network, storage, navigation).

## Modules

- A file is ≤150 lines target / 300 soft / 500 hard (data tables exempt).
- One concept per file. A screen file owns its screen; shared logic goes to
  `lib/`, shared UI to `components/`, state to `store/`, data to `constants/`.
- Imports: third-party, then absolute/local, grouped. No mid-file imports
  (the existing mid-file `import type` in `MoodEngineHost.tsx` is a smell to avoid
  in new code).

## Error handling

- Never swallow: handle, log (`__DEV__`-guarded), or rethrow with context.
- Catch the narrowest scope that can recover; don't wrap whole functions in try.
- User-facing failures degrade gracefully; never crash the render tree.
- Async effects: guard against setting state after unmount.

## Abstraction — Rule of Three

- First time: write it inline.
- Second time: duplicate it (resist premature abstraction).
- Third time: extract the shared helper. Not before — a wrong abstraction costs
  more than duplication.

## Testing / verification

- Unit tests: `npm test` (Jest + jest-expo). Tests live in `__tests__/` folders next to
  the code; current coverage is pure logic (`lib/`, `store/`, extracted helpers). When
  you add or change a pure function, add/update its test.
- Plus `npx tsc --noEmit` (no *new* type errors) + a real device run for behavioural
  changes. Paste the evidence.
- Component/render tests (@testing-library/react-native) are not set up yet — a sensible
  next step once pure-logic coverage grows.

## Refactoring

- Behaviour-preserving by default. One mechanical transform at a time, verify, repeat.
- Splitting an oversized file: extract leaf pieces first (pure helpers, sub-components),
  re-verify tsc + run after each extraction. Never bulk-move logic blind.
- Keep the diff reviewable — a stranger should follow each step.

## Large-write discipline

- Before a large/new file: search for an existing home; confirm it doesn't exist.
- Write the smallest version that works; don't speculate features.
- Stay within the size caps from the start — don't write 600 lines then "split later".
