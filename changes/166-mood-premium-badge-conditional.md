# Mood features: Premium badge hides once owned

**Date:** 2026-05-25
**Type:** fix

## Problem

Re-checking all Mood-based features surfaced one real bug: the "💎 Premium"
badges (`<PremiumLock />`) on every mood feature card — "Even when app is
closed" (background + daily prompt), Friend check-in, Sleep/Wake (and the hidden
camera Mood Mode) — were rendered **unconditionally**. So a user who had bought
**Mood** (or **All Access**) STILL saw a "Premium" badge on every mood feature
they already owned. Shuffle and theme-pack gate their badge on the entitlement
(`!hasThemePacks`); mood never did.

## Solution

Gated all four mood `<PremiumLock />` badges on `!hasMood` (the already-computed
`useEntitlement('mood')` value), so the badge shows only to non-owners and
disappears the moment the user owns Mood / All Access — consistent with the
shuffle and theme-pack screens.

### Also verified during the re-check (no change needed)

- Every mood toggle's **OFF path skips the gate** — you can always turn a
  feature off (background, daily, friend, sleep/wake).
- **ON paths** gate via `gateFeature('mood', …)`, then guard on pool/pack +
  notification/camera permission, and flip the store flag — the bootstrap
  subscriber starts the matching engine (context-mood FGS / friend FGS /
  sleep-wake FGS / scheduled notifications).
- The **camera Mood Mode card is correctly hidden** (`CAMERA_FEATURE_ENABLED =
  false`) — no dead toggle.
- Friend check-in **rolls the toggle back** + alerts if scheduling fails.

## Files changed

- `app/(tabs)/mood.tsx` — 4× `<PremiumLock />` → `{!hasMood ? <PremiumLock /> : null}`.

## Verification

- `npx tsc --noEmit` → 0 errors.
- **Needs a rebuild** to land (JS embedded in the release APK).
- On-device: with Mood unowned, the badges show; after subscribing (mock) the
  badges disappear and the toggles operate.

## Notes

- With enforcement live, tapping a locked mood toggle routes to `/subscription`
  (by design); the badge now correctly signals "premium" to non-owners.
- Minor UX (left as-is): the "pick a pool, then it auto-turns-on" resume is wired
  only for the disabled camera Mood Mode; background/daily/friend/sleep-wake show
  a "pick a pool first, then turn on" toast (intentional 2-step).
