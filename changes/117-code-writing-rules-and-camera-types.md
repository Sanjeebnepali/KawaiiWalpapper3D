# Code-writing standards codified + MoodEngineHost camera types

**Date:** 2026-05-24
**Type:** chore + refactor

## Problem

The owner's senior developer sent back a code-review checklist (mandatory check
order, red-flag auto-rejects, file/function size limits, "four axes", evidence-only,
production-quality bar). The checklist was auto-generated from the reviewer's *own*
project ("keasy") — it told us to "load" `docs/rules-ondemand/code-writing-deep.md`,
`.claude/rules/*.md`, referenced `NonceContext.tsx`, and a "project-contract-loader"
hook. None of those existed in this repo (verified). The owner asked to apply the
standards here **without breaking any logic — everything must still run as-is**, and
chose "codify the rules + safe behaviour-preserving code fixes only" (no large file
splits).

## Solution

Two parts, both behaviour-preserving.

**1. Codified the generic, applicable rules as this repo's review contract.** Authored
the rule files the checklist describes, adapted for this project (TS + Expo Router + RN
New Arch, and the fact that there is no unit-test suite — tsc + on-device run are the
verification gates). Wired them into `CLAUDE.md` so they're discoverable; the deep
rulebook stays load-on-demand. The keasy-specific files (`keasy-production-ops.md`,
`design-preferences.md`) and the loader hook were intentionally NOT recreated — they
don't apply here; this is documented in the new CLAUDE.md section.

**2. Fixed the one concrete red-flag violation in code.** A scan found the codebase
already clean on most auto-rejects (no empty catches; no `doStuff`/`process`-style
names — the only `any` uses were `components/MoodEngineHost.tsx:32,71`). Replaced both
with precise types from expo-camera:
- `CameraView` typed `typeof ExpoCameraView | null` (the lazily-`require`d component).
- the camera ref typed `useRef<ExpoCameraView | null>(null)`.
- a type-only `import type { CameraView as ExpoCameraView }` — fully erased at compile
  time, so the deliberate lazy `require('expo-camera')` (avoids eager parse-time load)
  is preserved.
- added a post-hooks `if (!CameraView) return null; const Camera = CameraView;` guard
  inside `ActiveEngine` so the JSX usage narrows the union without an `any` cast and
  without changing hook order.

Evidence checked before typing: `expo-camera`'s `CameraView` is `export default class
CameraView extends Component<CameraViewProps>` with `takePictureAsync` — valid as both
the component type and the ref instance type, and structurally compatible with
`useMoodDetector`'s `{ current: { takePictureAsync?: Function } | null }` param.

## Files changed

- `components/MoodEngineHost.tsx` — removed both `any`s; type-only import; non-null guard.
- `.claude/rules/code-writing.md` — new: check order, red flags, size limits, word semantics.
- `.claude/rules/execution-discipline.md` — new: make→test→fix; finish multi-step work.
- `.claude/rules/no-guessing-evidence-only.md` — new: claims need observed evidence.
- `.claude/rules/four-axes-always.md` — new: speed+accuracy+quality+no-guessing.
- `.claude/rules/production-quality-bar.md` — new: 6-month test, typed boundaries, decision logs.
- `docs/rules-ondemand/code-writing-deep.md` — new: deep rulebook (load on demand).
- `CLAUDE.md` — new "Code-writing standards (review contract)" section pointing to the above.

## Verification

`npx tsc --noEmit`: 5 errors, **all in untouched files** (`ai.tsx`, `ai/preview.tsx` —
the known `as Href` expo-router cast issue; `modules/*` `addListener` typings). **Zero
errors in `MoodEngineHost.tsx`** → the type change adds no new errors. These 5 predate
this change and don't block the build (build path is Babel, which strips types). No
runtime behaviour changed; no native rebuild needed (JS/types + docs only).

## Notes

- File-size hard-cap violations are real but were deliberately deferred per the owner's
  choice (safe fixes only, no big splits): 36 files exceed the 300-line soft cap and
  ~14 exceed the 500-line hard cap, topped by `app/(tabs)/mood.tsx` at **3,047 lines**.
  Splitting these needs a staged, per-file, verified refactor — risky with no test
  suite. The new rules govern *future* code; the existing oversized files are a separate
  follow-up if/when the owner wants it.
- The 5 pre-existing tsc errors are a candidate cleanup (`as Href` casts already
  blessed by CLAUDE.md), also out of scope for this change.
