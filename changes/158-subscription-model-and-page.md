# Subscription model + à la carte subscription page

**Date:** 2026-05-25
**Type:** feature

## Problem

The app had entitlement plumbing (`isPremium` / `isCouplePremium` flags, gate
helpers) but **no actual subscription page** — premium gates just popped an
alert, and the only "payment-ish" surface was a confusing "Couple Pairing"
section in Settings that showed the *friend* invite code (not a couple code).

The owner asked to: (1) remove that Couple Pairing section and add a real
"payment option like other apps"; (2) let users **check boxes to buy any of
four premium areas à la carte, or All Access**, billed **Monthly or Yearly**;
(3) wire the four areas — Theme Packs, Mood, Premium Collection, Couple — to the
subscription model; (4) make the couple rule **buyer-keeps / partner-re-locks**
on unlink; and (5) document the architecture with diagrams.

## Solution

**Entitlement model (à la carte).** Split the single `isPremium` flag into four
independent flags + an `allAccess` bundle, all persisted in `store/settings.ts`
(schema v2→v3 migration maps old `isPremium:true` onto the three non-couple
areas; a held `isCouplePremium` becomes `'purchased'`). Couple keeps its
`isCouplePremium` name and gains `coupleSource: 'purchased'|'inherited'|null`.

**One read path** in `lib/billing.ts`: `hasEntitlement(feature)` (imperative)
and `useEntitlement(feature)` (reactive hook) = `!SUBSCRIPTIONS_ENABLED ||
allAccess || <feature flag>`. Enforcement flipped on (`SUBSCRIPTIONS_ENABLED =
true`) with a `__DEV__` "unlock All Access" escape hatch (`devUnlockAll`).

**One gate** `gateFeature(feature, onUnlock)` (`components/PremiumLock.tsx`):
entitled → run; locked → `router.push('/subscription?highlight=feature')`.
Migrated all ~13 call sites (theme packs, shuffle, mood ×6, premium-collection
apply, couple) from the old `gatePremium`/`gateCouplePremium`.

**Couple buyer/partner rule.** `grantCoupleEntitlement(source)` records why the
perk is held (never downgrades a purchase to inherited);
`reconcileCoupleEntitlement(isLinked)` re-locks an `'inherited'` partner on
unlink but keeps a buyer / All Access holder. Source is derived from role (the
code's **creator** paid → `'purchased'`; the **accepter** inherited), so it
survives reinstall. The revoke fires at three points so both phones converge:
the local `unlinkCouple()`, the realtime `status→unlinked` handler, and the
cold-start reconcile in `coupleBootstrap` (for an unlink that happened while the
app was closed).

**Subscription page** `app/subscription.tsx` + `components/subscription/{PlanRow,
BillingToggle}.tsx`: Monthly/Yearly toggle, four checkbox plan rows + an All
Access row, live total, mock "Subscribe" (`purchasePlans`), Restore, dev unlock,
legal note. Plan catalog + placeholder prices in `constants/plans.ts`.

**Settings:** removed the "Couple Pairing" section (+ the now-dead
`makeCopyInviteCode`/Clipboard) and added a **"Subscription"** section with a
"Manage Subscription" row showing status (`Free` / `N of 4 unlocked` / `All
Access`) that opens the page.

Purchases are a **local mock** (flags flip) by design — RevenueCat needs store
products + a native rebuild that can't happen in-session. The read path and
every call site are production-shaped, so going live swaps only `purchasePlans`.

## Files changed

- `store/settings.ts` — replaced `isPremium` with `allAccess`/`entThemePacks`/`entMood`/`entCollection` + `coupleSource` + `billingPeriod`; v2→v3 migration; comments.
- `lib/billing.ts` — rewritten: `PremiumFeature`/`PlanId`/`BillingPeriod`, `hasEntitlement`, `useEntitlement`, `hasCouplePremium`, `grantCoupleEntitlement`, `reconcileCoupleEntitlement`, `purchasePlans`, `devUnlockAll`.
- `constants/billing.ts` — `SUBSCRIPTIONS_ENABLED = true`; generalized doc.
- `constants/plans.ts` — **new**: `PLANS` (4) + `ALL_ACCESS`, placeholder prices, helpers.
- `components/PremiumLock.tsx` — `gateFeature` (navigates to page) + `gateCouplePremium` alias; removed `DEV_FREE_UNLOCK`/alert.
- `app/subscription.tsx` — **new** subscription page.
- `components/subscription/PlanRow.tsx`, `BillingToggle.tsx` — **new**.
- `app/_layout.tsx` — registered `subscription` route.
- `app/(tabs)/profile.tsx` — removed Couple Pairing; added Subscription section + status.
- `lib/settingsActions.ts` — removed dead `makeCopyInviteCode` + Clipboard/Profile imports.
- Gate call sites migrated: `app/wallpapers/theme-packs.tsx`, `app/theme-pack/[id].tsx`, `app/shuffle/[id].tsx`, `app/(tabs)/mood.tsx`, `app/mood/camera.tsx`, `hooks/usePickCollection.tsx`, `app/wallpaper/[id].tsx`, `components/MoodEngineHost.tsx`.
- `store/shuffle.types.ts`, `store/shuffle.ts` — `canAddCollection` param `isPremium`→`unlimited`.
- Couple revoke wiring: `lib/couple.ts`, `lib/couple.hydration.ts`, `lib/couple.realtime.ts`, `lib/coupleBootstrap.ts`.
- Comment-only accuracy: `lib/moodBootstrap.ts`, `lib/moodBackgroundTask.ts`, `constants/mockData.ts`, `app/ai/preview.tsx`.
- `lib/__tests__/billing.test.ts` — **new**, 13 tests.
- `docs/SUBSCRIPTION_ARCHITECTURE.md` — **new**, mermaid diagrams.

## Verification

- `npx tsc --noEmit` → **0 errors** (baseline was 0; no new errors).
- `npx jest` → **157 passed / 10 suites** (was 144; +13 billing tests).
- Manual (on device): Settings → "Subscription" opens the page; tapping a 15-min
  shuffle timer / a mood toggle / applying a premium wallpaper while unentitled
  routes to the page with that area pre-checked; subscribing flips the lock.
  Dev-unlock grants All Access. Couple: buyer generates code → partner enters →
  both unlocked; unlink → partner re-locked, buyer kept.

## Notes

- **Mock purchases** — no charge is made; `purchasePlans` writes flags. RevenueCat
  swap documented in `docs/SUBSCRIPTION_ARCHITECTURE.md §6` (write path only).
- **Enforcement is ON.** Fresh installs see locks; flip `SUBSCRIPTIONS_ENABLED`
  in `constants/billing.ts` to bypass for testing, or use the dev-unlock button.
- Prices in `constants/plans.ts` are **placeholders** — edit freely.
- The `invite_code` backend field (`store/auth.ts`, Supabase) is untouched — only
  its Settings UI was removed. Couple pairing still works from the Couple tab.
- JS-only change; no native rebuild required to test the page/gates.
