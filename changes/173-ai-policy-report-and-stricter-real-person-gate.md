# 173 — AI content-policy report + stricter real-person / IP gate

## Problem

User reported that "donald trump giving speech" generated an image despite
change 172's moderation gate, and asked for (a) a **full written report** of
what the AI Generator is allowed / not allowed to produce — strict, with
copyright/likeness/sentiment in mind — and (b) the gate tightened accordingly.

Root cause (verified, not guessed):

- The installed APK **did** contain the 172 code — the release bundle rebuilt
  (`createBundleReleaseJsAndAssets` → `2093 modules`, up from 2090 = the 3 new
  files, embedded in `index.android.bundle`).
- The logic blocked the **full name** `donald trump` but **not the surname
  alone**. A throwaway test confirmed: `moderatePrompt('trump giving a speech')`
  → `{ allowed: true }`. The blocklist was full-names-only, so any surname,
  mononym, nickname, or role-only reference ("the president giving a speech")
  sailed through.

## Solution

### 1. The report (the deliverable the user asked for first)

New `docs/AI_CONTENT_POLICY.md` — the single source of truth: the allowed list,
the prohibited matrix by category + severity, how `moderatePrompt` detects each
(normalise → word-boundary → severity order → co-occurrence → role heuristic),
the deliberate kawaii false-positive carve-outs, the **honest limitations**, and
the recommended additional layers (provider safety filter; a remote LLM
classifier for true paraphrase coverage; negative prompt).

### 2. Stricter real-person gate (`lib/ai/moderationTerms.ts`)

- Many more curated FULL names (politicians, athletes, musicians, actors, tech).
- **Unambiguous single-token names** now match bare: `trump`, `biden`, `obama`,
  `putin`, `zelensky`, `modi`, `beyonce`, `rihanna`, `ronaldo`, `zuckerberg`, …
  — closing the surname gap that let "trump" through.
- **Public-figure role heuristic:** `president`, `prime minister`, `senator`,
  `politician`, `celebrity`, `rapper`, `influencer`, `youtuber`, `footballer`, …
  block as `real_person` even when no name is typed ("the president giving a
  speech").
- Tokens that double as kawaii words are deliberately **excluded** as bare
  terms and only matched via full names: `drake` (a duck), `musk` (musk deer),
  `swift` (a bird), `west`, `cruise`, `gates`, `jordan`, `madonna`. Royalty
  words (`king`/`queen`/`prince`/`princess`) are NOT triggers.

### 3. Wider IP / copyright coverage

Added studios / IP-holders by name (`disney`, `pixar`, `dreamworks`, `marvel`,
`nintendo`, `studio ghibli`/`ghibli`, `sanrio`, `vocaloid`, `hoyoverse`) so
"in ghibli style" / "disney style" are caught, plus modern franchises the
original list missed (`pusheen`, `rilakkuma`, `genshin impact`, `poppy
playtime`, `skibidi toilet`, `hatsune miku`, `sonic`, …). Removed two
accidental duplicates (`splatoon`, `kirby star`).

No logic change in `promptModeration.ts` — the role words are part of
`REAL_PERSON_TERMS`, so the existing severity-ordered rule covers them.

## Files changed

- `docs/AI_CONTENT_POLICY.md` — NEW. The policy report.
- `lib/ai/moderationTerms.ts` — expanded REAL_PERSON_TERMS (names + mononyms +
  role heuristic) and IP_TERMS (studios + modern franchises).
- `lib/ai/__tests__/promptModeration.test.ts` — +8 cases (now 31).

## Verification

- `npm test` → **195 passed** (12 suites). New: `trump giving a speech` →
  real_person; `the president giving a speech` → real_person; `ghibli style` /
  `disney style` / `pusheen` → IP. False-positive guards hold: `drake duckling`,
  `musk deer`, `swift bird`, `kawaii princess`, `king penguin`, `messy hair`,
  `cruise ship` all still allowed.
- `npx tsc --noEmit` → exit 0.

## Notes / honest limits (carried from the report)

Still a client-side keyword + heuristic gate on prompt TEXT. It now catches
surname-only and role-only real-person references and studio-style copies, but
it **cannot** beat paraphrase ("the orange ex-president"), obfuscation
(leetspeak), or unlisted new celebrities/characters, and it never sees the
generated image. For a hard "no copyright / no likeness" guarantee the right
next layer is a **remote moderation classifier** before generation — documented
in `docs/AI_CONTENT_POLICY.md §5`, gated on a product decision (adds network +
latency + cost to the free tier). JS-only; `run` to embed.
