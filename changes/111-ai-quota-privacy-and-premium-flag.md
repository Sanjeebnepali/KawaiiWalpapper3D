# AI sign-out privacy, un-gameable daily quota, dead config, premium flag

**Date:** 2026-05-23
**Type:** fix

## Problem
QA found three core issues plus one product flag to make explicit:
- **H5 (privacy):** `signOut()` called the AI store's in-memory `reset()`, which does **not** wipe the persisted blob (`@kawaii/ai@v1`). On a shared device, the next user inherited the previous user's pasted API keys (and thus their billing), generation history thumbnails, and consumed daily quota.
- **M1 (quota bypass):** the AI 3/day free limit was derived from the persisted `history` list, so **"Clear AI history" reset the quota to 0** — a trivial bypass.
- **M2 (dead config):** `store/settings.ts` `maxGenPerDay` (default 50) was dead state — the real cap is the hardcoded `FREE_DAILY_LIMIT = 3` in `lib/ai/client.ts`.
- **H1 (product flag):** the paywall's only button sets `isPremium = true` for free. The owner wants this **kept** for testing — the job here is only to make it clearly intentional and flag it for launch, **not** to change behavior.

## Solution
- **H5 — `store/auth.ts`:** `signOut()` now `await`s the AI store's disk-wiping `resetAll()` (wrapped in try/catch) instead of in-memory `reset()`. After sign-out the next user starts with no tokens, no history, no inherited quota. `isPremium`/`isCouplePremium` are intentionally left alone (premium stays open for testing per H1).
- **M1 — `store/ai.ts` + `lib/ai/client.ts`:** added a persisted `dailyGen: { dayKey, count }` decoupled from `history`. `bumpDailyGen()` rolls over on a new local day else increments; it's called only on a **successful** generation (skipped for unlimited/user-key users). `todayCount()` now reads `dailyGen` instead of counting history, so `clearHistory()` / `removeGeneration()` no longer reset the limit. `dailyGen` is included in `resetAll()`'s wipe, so a real sign-out still grants a fresh allowance. `FREE_DAILY_LIMIT = 3` behavior and `inFlightReservations` are unchanged.
- **M2 — `store/settings.ts`:** removed the dead `maxGenPerDay` field and its default (grep confirmed nothing reads it; the Settings screen only uses `generateQuality`/`autoSaveGenerated`). Hydration is safe — `diffFromDefaults` iterates `Object.keys(DEFAULTS)`, so a stale value in an old persisted blob is ignored.
- **H1 — `components/PremiumLock.tsx`:** introduced `const DEV_FREE_UNLOCK = true;` with a prominent comment + `TODO(billing)` to flip it false and wire `Purchases.presentPaywall()` before public launch. The unlock now routes through this flag. Because the flag is `true`, **runtime behavior is identical** — it still unlocks for testing. Documentation/flagging only.

## Files changed
- `store/auth.ts` — `signOut()` awaits `resetAll()` (H5).
- `store/ai.ts` — persisted `dailyGen` + `bumpDailyGen()`, `todayCount()` reads it, included in `resetAll()` (M1/H5).
- `lib/ai/client.ts` — increments `dailyGen` on success; gate reads the persisted counter (M1).
- `store/settings.ts` — removed dead `maxGenPerDay` (M2).
- `components/PremiumLock.tsx` — `DEV_FREE_UNLOCK` flag + launch TODO; behavior unchanged (H1).

## Verification
- `npx tsc --noEmit` — clean for these files.
- On device: generate an image, then Settings → Clear AI history — the daily count no longer resets (was a free reset before). Sign out, sign in as a different account — no inherited tokens/history. Tapping a 💎 feature still unlocks (testing behavior preserved).

## Notes
- **Remaining quota bypasses need a server:** reinstall wipes AsyncStorage (fresh 3/day) and device-clock changes roll the day key. Closing these requires a server-authoritative per-account daily counter (the Supabase auth gate already exists) — flagged as follow-up.
- **H1 must not ship as-is:** flip `DEV_FREE_UNLOCK` to `false` and wire the real purchase before public launch, or every premium feature is free.
