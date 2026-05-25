# Market research — subscription & pricing in the niche

**Date:** 2026-05-25
**Type:** docs

## Problem

The owner asked for complete research on how comparable apps in the wallpaper
niche run their subscriptions, what they charge and how they implement it, how
this app is different, and guidance on choosing the subscription structure +
pricing.

## Solution

Added `docs/MARKET_RESEARCH_SUBSCRIPTION.md` — a researched strategy doc built
from public sources (RevenueCat State of Subscription Apps 2025, a 1,200-paywall
photo/video analysis, and competitor store/help pages). Contents:

- **5 monetization archetypes** in the niche: credit/marketplace + rewarded ads
  (Zedge), curated subscription (Walli), one-time + à-la-carte packs (Backdrops),
  AI-credit (AI generators), and the predatory weekly-sub flood (to avoid).
- **Competitor snapshot table** with model + price points (Zedge, Walli,
  Backdrops, anime live-WP apps, Plaw, Locket, Paired, Lovewick).
- **Industry benchmarks**: median monthly $7.99–$9.99, annual ~$34.80, creative
  weekly $4.99–$9.99, lifetime $99–$299, trial-length→conversion, hybrid-model
  trend.
- **How this app differs** (hybrid: kawaii-baby AI + mood + couple proximity +
  shuffle) and how the chosen à-la-carte + All Access + per-couple model maps to
  proven patterns (Backdrops, Paired).
- **Concrete pricing recommendation** (tuned tiers, hero All Access w/ annual
  anchor, lifetime SKU, 7-day trial, AI-credit + optional rewarded-ad levers,
  what to avoid) + a rollout plan. Sources linked.

No code changed.

## Files changed

- `docs/MARKET_RESEARCH_SUBSCRIPTION.md` — **new**, research + pricing strategy.

## Verification

- Research/docs only — no `tsc`/`jest` impact.
- Every claim links to a public source; figures noted as snapshots to re-verify.

## Notes

- Competitor prices change frequently — the doc flags figures as snapshots and
  recommends re-verifying before setting final prices in `constants/plans.ts`.
- Recommendation complements `SUBSCRIPTION_ARCHITECTURE.md` (the *how*) with the
  *what to charge and why*.
