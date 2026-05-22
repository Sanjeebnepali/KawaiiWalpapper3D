# 103 — "Premium Collection" / "Best Fit" renames + AI free limit (3/day, unlimited with own key)

## Problem

Owner requests:

1. Rename the **"Dual"** top tab → **"Premium Collection"**.
2. Rename the home body **"Premium"** section → **"Best Fit"**.
3. AI generation: the daily cap should be **3 images/day** for free users
   (the Settings slider showed a large adjustable number).
4. If a user **pastes their own API key** (ChatGPT / Gemini / etc.), they get
   **unlimited** generation.

## Solution

### 1–2. Renames (display-only, routes/ids unchanged)

- `constants/mockData.ts` — `topTabs` entry `dual` label `'Dual'` →
  `'Premium Collection'`. The id stays `dual` so the route `/wallpapers/dual`
  and all wiring are untouched.
- `app/wallpapers/dual.tsx` — screen header `"Dual Wallpapers"` →
  `"Premium Collection"` so the title matches the tab after navigation.
- `app/(tabs)/index.tsx` — home `SectionTitle` `"Premium"` → `"Best Fit"`
  (caption → "Picked to fit your screen"). Section id / `goPremium` route
  (`/category/premium`) unchanged.

### 3–4. AI free limit + unlimited-with-own-key (`lib/ai/client.ts`)

- Added `export const FREE_DAILY_LIMIT = 3`.
- Added `hasUnlimitedGeneration()`: true when the active provider runs on a
  USER-supplied API key — `huggingface` with a non-empty `hfToken`, or
  `pollinations` with a non-empty `pollToken`. The built-in default token /
  anonymous tier is NOT a user key, so it stays capped.
- Rewrote the daily-quota gate: free/built-in users are capped at
  `FREE_DAILY_LIMIT` (3) per local day; users with their own key bypass the
  cap entirely. New message: "Free limit reached (3/day). Paste your own API
  key in Settings → AI Generator Settings for unlimited generation."
- Dropped the dependency on `useSettingsStore.maxGenPerDay` (and its import) —
  the limit is now a product rule, not a user-tunable slider.
- `app/(tabs)/ai.tsx` — the header counter now reads `… · 2 / 3 today` for
  free users, or `… · unlimited (your key)` once a key is pasted.
- `app/(tabs)/profile.tsx` — replaced the "Max Generation Per Day" slider with
  an info row: "Daily Generation Limit — Free: 3 images/day. Paste your own
  API key in the token row above for unlimited generation." (Removed the now
  unused `maxGenPerDay` selector. The store field is left in place, unused.)

## Files changed

- `constants/mockData.ts`, `app/wallpapers/dual.tsx`, `app/(tabs)/index.tsx` —
  renames.
- `lib/ai/client.ts` — `FREE_DAILY_LIMIT`, `hasUnlimitedGeneration()`, gate
  rewrite.
- `app/(tabs)/ai.tsx` — counter shows limit / unlimited.
- `app/(tabs)/profile.tsx` — slider → info row.

## Verification

- `npx tsc --noEmit` — clean for every changed file. (Two PRE-EXISTING
  `typedRoutes` cast warnings remain at `ai.tsx:227/485` — unrelated to this
  change; the Babel build ignores them.)
- Manual (after release re-embed): free user can generate 3×/day then sees the
  "paste your own key" message; after pasting an HF key in Settings → AI
  Generator Settings the AI header shows "unlimited (your key)" and the cap is
  gone. Tab reads "Premium Collection"; home section reads "Best Fit".

## Notes / scope

- **"Unlimited with own key" works today for the existing key fields**
  (Hugging Face token; Pollinations token). Pasting a key uses the user's own
  quota, so no app cap.
- **ChatGPT (OpenAI/DALL·E) and Gemini are NOT yet selectable providers** —
  each needs its own provider integration (different API + endpoint + key
  field), which is a larger, separately-testable feature. The registry already
  has commented stubs (`dalleProvider`, `stabilityProvider`, …). Deliberately
  left as a follow-up rather than shipping an untested integration; can be
  added next on request.
- JS-only — `run` to re-embed the bundle; no native recompile.
