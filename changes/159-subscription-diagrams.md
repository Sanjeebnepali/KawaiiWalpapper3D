# Full subscription-model diagram doc

**Date:** 2026-05-25
**Type:** docs

## Problem

The owner asked for a **full diagram** of how the subscription model works in a
markdown file. changes/158 shipped `docs/SUBSCRIPTION_ARCHITECTURE.md` (prose +
a few diagrams), but a single, diagram-first reference covering the whole flow
end-to-end was wanted.

## Solution

Added `docs/SUBSCRIPTION_DIAGRAMS.md` — a **master flow chart** (the whole model
in one figure: tap → entitlement check → paywall → purchase → flags → couple
rule → going-live seam) plus eight focused Mermaid diagrams (render on GitHub):

0. Master flow chart — everything end-to-end in a single figure.
1. What's premium (areas → flags) + table.
2. System map — the whole model on one page.
3. Gate decision — what `hasEntitlement` returns.
4. Tap-to-unlock sequence (user → gateFeature → paywall → purchase → unlock).
5. `purchasePlans` → which flags flip.
6. Couple buyer/partner rule — state machine, two-device sequence, and the
   three revoke points.
7. Enforcement switch + dev unlock.
8. RevenueCat seam (today vs production) + a file map.

Cross-linked from `SUBSCRIPTION_ARCHITECTURE.md`. No code changed.

## Files changed

- `docs/SUBSCRIPTION_DIAGRAMS.md` — **new**, diagram-driven reference.
- `docs/SUBSCRIPTION_ARCHITECTURE.md` — added a pointer to the diagrams doc.

## Verification

- Docs only — no `tsc`/`jest` impact (158's run already green: tsc 0, jest 157/10).
- Diagrams use standard Mermaid (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`)
  that GitHub renders natively.

## Notes

- Diagrams mirror the real code (flag names, function names, file paths) so they
  stay a faithful map; update them alongside `lib/billing.ts` / `store/settings.ts`
  if the model changes.
