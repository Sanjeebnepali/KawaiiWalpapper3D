# AI Image-Generation Content Policy & Enforcement

**Status:** active · **Owner:** app team · **Last updated:** 2026-05-26 (change 173)

This is the single source of truth for **what the AI Generator is allowed to
produce and what it must refuse**, and **how that is enforced in code**. It
exists because the app ships AI generation to an app store: copyright,
likeness, child-safety, and platform-policy violations are legal and
store-rejection risks, not just taste issues.

The enforcement code lives in:

- `lib/ai/moderationTerms.ts` — the prohibited-content term tables (data).
- `lib/ai/promptModeration.ts` — `moderatePrompt()`, the Layer-1 keyword logic.
- `lib/ai/promptClassifier.ts` — `classifyPrompt()`, the Layer-2 remote classifier.
- `components/aiGenerator/ModerationAlert.tsx` — the animated "blocked" alert.
- `hooks/useAiGenerator.ts` — runs Layer 1 then Layer 2 before any generation.

---

## 1. What we ALLOW

Original, cute, kid-friendly content only:

- Original chibi / kawaii baby-doll style characters.
- Original superhero / anime-inspired / mascot concepts (NOT named existing ones).
- Professional / streetwear / cultural fashion (respectful, age-appropriate).
- Nature, landscapes, seasonal themes, florals.
- Cute food, objects, animal companions (cute style).
- Mild fantasy elements; cute emotion expressions.
- Age-appropriate couple characters.
- Cute-spooky (a *kawaii* ghost / pumpkin / friendly skeleton is fine — true
  horror is not).

## 2. What we PROHIBIT

Grouped by the moderation category that enforces it. **Severity order** (top =
checked first; the most serious matching category wins).

| # | Category | Prohibited (examples) |
|---|----------|-----------------------|
| 1 | `child_safety` | ANY sexualisation of a minor; suggestive poses / underwear / swimwear on child characters; a child in a dangerous, abusive, or grooming scenario; explicit CSAM terms. **Zero tolerance.** |
| 2 | `sexual` | Nudity (full or partial), sexual acts/suggestions, revealing/inappropriate clothing, fetish, any adult content. |
| 3 | `violence` | Blood, gore, weapons, fighting, war/combat, torture, self-harm, suicide, drug/alcohol abuse, animal cruelty. |
| 4 | `hate` | Racist/extremist symbols (Nazi, swastika, KKK, Confederate-flag), antisemitic/islamophobic imagery, hate-group symbols, discrimination/mockery. |
| 5 | `illegal` | Weapon/explosive/drug manufacturing, hacking/cybercrime, kidnapping, human trafficking, robbery, counterfeiting, forgery. |
| 6 | `real_person` | Real celebrities, politicians, athletes, or any private individual's likeness; deepfakes; "celebrity face on another body"; real children as reference. |
| 7 | `political` | Political propaganda, election interference, civic-unrest/incitement, flag desecration, religious-figure mockery. |
| 8 | `misinformation` | Fake news, manipulated-photo style, impersonating real organisations, fake emergency/official imagery, conspiracy promotion. |
| 9 | `horror` | Horror/gore, dark occult symbolism, grotesque or genuinely disturbing art (distinct from cute-spooky). |
| 10 | `intellectual_property` | Named characters (Disney/Pixar/DreamWorks, Marvel/DC, anime by name, Sanrio, Nintendo, KPop Demon Hunters, etc.), studios/IP-holders by name, brand names/logos, famous-artwork recreation, copying another artist's style by name. |

## 3. How detection works

`moderatePrompt(prompt)` is **deterministic, local, and instant** — it runs
before any network call, so a blocked prompt never spends a generation, hits
the provider, or charges the daily quota.

1. **Normalise.** Lowercase → strip accents → replace every non-alphanumeric
   run with a space → collapse whitespace → pad with spaces. So `"Spider-Man!"`
   becomes `" spider man "`.
2. **Word-boundary match.** Each banned term is tested as `" <term> "` against
   the padded text. This is the key correctness property: `war` matches
   `"a war scene"` but NOT `warm`/`award`; `kill` does not trip `killer whale`.
3. **Severity-ordered rules.** Categories are checked top-to-bottom (table
   above); the first hit wins, so a prompt is labelled by its worst problem.
4. **Child-safety co-occurrence.** A *minor* term (`baby`, `toddler`, …) plus a
   *sexual* term escalates to `child_safety`. Because this is a baby-character
   app, "baby" is in almost every prompt — so any sexual term is, correctly,
   child sexualisation.
5. **Public-figure heuristic (real_person).** Beyond curated names, role words
   (`president`, `politician`, `celebrity`, `rapper`, `influencer`, …) block as
   `real_person`, catching "the president giving a speech" even when no name is
   typed.

A blocked verdict drives `ModerationAlert` — a friendly, animated, per-category
explanation. The matched term is **never shown** to the user (it would just
teach which word to swap).

## 4. False-positive discipline (this is a kawaii *baby* app)

Strictness must not break the core use case. Deliberate carve-outs:

- `baby` / `toddler` / `child` never block alone — only paired with a sexual term.
- Cute-spooky staples (`ghost`, `skull`, `pumpkin`, `zombie`, `witch`) and cute
  foods (`apple`, `cherry`) are **not** banned. `apple logo` is IP; `apple` isn't.
- `bath bomb` is allowed; only weaponised compounds (`pipe bomb`, `dynamite`) block.
- Ambiguous tokens that are also common/kawaii words are **excluded** as bare
  terms and only matched as full names: `drake` (a duck), `musk` (musk deer),
  `swift` (a bird), `west`, `cruise`, `gates`, `jordan`, `madonna`. We block
  `elon musk` / `taylor swift`, not `musk` / `swift`.
- Royalty words (`king`, `queen`, `princess`, `prince`) are NOT real-person
  triggers — "kawaii princess" / "king penguin" / "queen bee" are valid.

## 5. Known limitations (read this honestly)

This is a **first-line client gate on prompt _text_**. It is strong against the
obvious cases but is **not** a complete guarantee:

- It cannot read the *generated image* — only the prompt.
- It cannot beat paraphrase or obfuscation: "the orange ex-president", "n4ked",
  spacing tricks, or describing a recognisable person without naming them.
- Real-person and IP name lists are curated, **not exhaustive** — new
  celebrities/characters appear constantly.
- Explicit slurs are intentionally not enumerated in source; the hate-symbol /
  group terms cover the visual cases.

**Layered enforcement (what is actually wired):**

- **Layer 1 — local keyword/heuristic gate** (`moderatePrompt`): instant, free,
  offline. Runs first; blocks the obvious cases with zero network.
- **Layer 2 — remote semantic classifier** (`lib/ai/promptClassifier.ts`,
  change 174): an LLM call (Pollinations text — free, tokenless,
  OpenAI-compatible) that classifies prompts which passed Layer 1 against these
  categories. Catches paraphrase ("the orange ex-president") and unlisted
  names/characters that keywords miss. It is **best-effort and fails OPEN**: a
  9 s timeout, HTTP error, malformed reply, or an open circuit breaker (after 2
  consecutive failures, 3-minute cooldown) all return "allowed" rather than
  blocking — because the free endpoint is observably flaky (a bring-up call
  timed out at 30 s) and Layer 1 is the always-on floor. So Layer 2 can only
  ever make moderation *stricter*, never break generation when it's down.
  Trade-off: adds ~3–9 s of "Reviewing…" before a generation when the endpoint
  is healthy. A blocked prompt only counts when the model returns
  `allowed:false` AND a recognised category; anything ambiguous fails open.

**Further backstops / options:**

- **Provider safety filter** — providers return `ImageGenError` reason
  `safety_filter`; the app already surfaces it. (Coverage varies by provider.)
- **Negative prompt** — a "do NOT render real people / logos / copyrighted
  characters / nudity / gore" negative prompt. Currently only the HuggingFace
  provider plumbs `negative_prompt`; the default Pollinations provider ignores
  it, so this is inconsistent defense-in-depth — not relied upon.
- **A paid/keyed classifier** (e.g. OpenAI moderation, or a dedicated model)
  would remove the free-tier flakiness if stricter latency/uptime is needed.

## 6. How to extend

- Add a term: edit the relevant array in `lib/ai/moderationTerms.ts`. Keep terms
  lowercase, no punctuation, multi-word phrases space-separated. Add plurals
  explicitly (word-boundary matching does not stem).
- Add a category: extend `ModerationCategory` + the rule order in
  `promptModeration.ts` and the `PRESENTATION` map in `ModerationAlert.tsx`.
- Always add/extend a test in `lib/ai/__tests__/promptModeration.test.ts` —
  both a positive (blocks) and a false-positive guard (still allows).
