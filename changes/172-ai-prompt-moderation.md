# 172 — AI prompt moderation gate + animated blocked-prompt alert

## Problem

The AI Generator (`app/(tabs)/ai.tsx`) sent ANY user prompt straight to the
image provider. For a kawaii-baby wallpaper app shipping to an app store,
that's a policy and safety liability: nothing stopped a user from generating
copyrighted characters (Disney/Marvel/anime/Sanrio/Nintendo), gore, sexual
content, hate symbols, real-celebrity likenesses, or — most seriously — any
sexualised or endangered depiction of the child characters the app is built
around.

The user supplied a detailed prohibited-content checklist (IP, violence,
sexual, child-safety, hate, political, real-person, illegal, misinformation,
horror) and asked for: (a) a rule check that runs while requesting the API,
(b) detection of which prohibited bucket a prompt falls under, and (c) an
"animated attractive alert" when a prompt is blocked.

## Solution

A client-side prompt gate that screens the prompt BEFORE any provider call,
so a blocked prompt never reaches the network, never spends a generation, and
never charges the daily quota.

### How detection works

- **`lib/ai/moderationTerms.ts`** (data table, exempt from the size cap) —
  prohibited terms grouped by category, plus co-occurrence groups
  (`MINOR_TERMS`, `SEXUAL_TERMS`).
- **`lib/ai/promptModeration.ts`** (`moderatePrompt(prompt) -> ModerationVerdict`)
  — normalises the prompt (lowercase, strip accents/punctuation, collapse
  whitespace, space-pad) so matching is **word-boundary** (`war` matches
  "a war scene" but not `warm`/`award`), then runs the category tables in
  **severity order** and returns the first (most serious) hit.
- **Child-safety co-occurrence:** a minor term + a sexual term escalates to
  `child_safety`. Because "baby" is present in almost every prompt here, any
  sexual term is — correctly — treated as child sexualisation. Explicit CSAM
  terms (`loli`, `shota`, …) block outright as the first rule.

Categories: `child_safety`, `sexual`, `violence`, `hate`, `illegal`,
`real_person`, `political`, `misinformation`, `horror`,
`intellectual_property`.

### False-positive discipline (this is a kawaii BABY app)

- `baby` / `toddler` / `child` live only in `MINOR_TERMS` and never block on
  their own.
- Cute-but-spooky kawaii staples (`ghost`, `skull`, `pumpkin`, `witch`,
  `zombie`) and cute foods (`apple`, `cherry`) are deliberately NOT banned —
  "kawaii ghost" / "kawaii apple" are valid prompts. `apple logo` is IP, but
  `apple` is not.
- `bomb` alone is not banned ("bath bomb" is a cute object); only weaponised
  compounds (`pipe bomb`, `dynamite`, …) are.
- Bare ambiguous brand words (`supreme`, `puma`) and the generic phrase
  `starry night` are excluded; only unambiguous tokens / `<brand> logo` are
  listed.

### The animated alert

- **`components/aiGenerator/ModerationAlert.tsx`** — a transparent `Modal`
  (floats above the tab bar) with an `expo-blur` dark backdrop, a
  spring-in card (`ZoomIn`), and a gently **pulsing** category icon badge
  (reanimated `withRepeat`/`withSequence`). Per-category copy + Ionicon +
  accent (red = safety, gold = conduct, lavender = IP). Tapping the backdrop
  or "Got it" dismisses. The matched term is intentionally NOT shown to the
  user (it would just teach which word to swap — it's dev-log/test only).

### Wiring

- `hooks/useAiGenerator.ts` — `onGenerate` calls `moderatePrompt(trimmed)`
  right after the empty-prompt guard; a blocked verdict logs under `__DEV__`,
  sets `moderation` state, and bails before the `AbortController` / quota /
  network. New `moderation` state + `dismissModeration` are returned.
- `app/(tabs)/ai.tsx` — renders `<ModerationAlert verdict={moderation}
  onDismiss={dismissModeration} />`.

## Files changed

- `lib/ai/moderationTerms.ts` — NEW. Prohibited-content term tables.
- `lib/ai/promptModeration.ts` — NEW. `moderatePrompt` + `ModerationVerdict`.
- `lib/ai/__tests__/promptModeration.test.ts` — NEW. 23 cases.
- `components/aiGenerator/ModerationAlert.tsx` — NEW. Animated alert.
- `hooks/useAiGenerator.ts` — moderation check + state.
- `app/(tabs)/ai.tsx` — render the alert.

## Verification

- `npm test` → **187 passed** (12 suites), incl. the 23 new moderation cases:
  every Quick Start suggestion passes; each category blocks with the right
  label; word-boundary guards (`warm`/`award`/`skillful`/`bath bomb`/`apple`)
  stay allowed; minor+sexual escalates to `child_safety`; case/punctuation
  insensitive.
- `npx tsc --noEmit` → exit 0, no errors.

## Notes / honest limits

- This is a first-line **client** gate on prompt TEXT. It can't see the
  generated image and won't catch paraphrase or obfuscation (leetspeak). The
  provider's own safety filter (`ImageGenError` reason `safety_filter`) is the
  backstop, and the term lists are easy to extend.
- Explicit racial/ethnic slurs are intentionally not enumerated in source;
  the hate-symbol/group terms cover the visual cases and the provider filter
  backstops slurs.
- Real-person and IP lists are curated, not exhaustive.
- Trade-off accepted: a few benign edges may over-block (`blood orange`,
  `war paint`); biasing toward safety is the right call for a kids' app, and
  the user can tune the tables.
- JS-only; no native rebuild needed (`expo-blur` + reanimated already in the
  app). `run` to embed into the release bundle.
