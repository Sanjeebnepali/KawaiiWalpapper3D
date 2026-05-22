# 096 — Fix fetchActiveCouple broken profiles embed (real cause of creator-stuck)

**Date:** 2026-05-22
**Type:** fix

## Problem

Even after #095 (keep realtime open for pending + 3 s poll), the couple
**creator stayed stuck** on "Waiting for your partner…" while the partner
linked fine. So the deeper cause was elsewhere.

## Root cause (confirmed against the live DB)

A REST probe of the exact query returned:

```
PGRST200 — Could not find a relationship between 'couples' and 'profiles'
using the hint 'couples_creator_id_fkey' in the schema 'public'.
```

`fetchActiveCouple` selected an **embed**:

```
creator:profiles!couples_creator_id_fkey(...),
partner:profiles!couples_partner_id_fkey(...)
```

But `couples.creator_id` / `partner_id` are foreign keys to **`auth.users`**,
NOT to `public.profiles`. PostgREST can't resolve the hint, so the **entire
query 400s** and `fetchActiveCouple` returns `null` every time. Both #095
advance paths (realtime handler AND the poll) call `fetchActiveCouple`, so
neither could ever flip the creator to `linked`. (It also means a linked
couple never rehydrated on cold boot.) The partner's side only worked because
`acceptCoupleCode` builds its link from the SECURITY-DEFINER RPC return, not
from `fetchActiveCouple`.

## Solution

Rewrite `fetchActiveCouple` to **not** use the embed:

1. Fetch the bare `couples` row (works under the existing "couples: read own"
   RLS) — this alone is enough to advance the creator to the dashboard.
2. Look up the partner's profile in a **separate** query. Reading another
   user's profile needs a new RLS policy (below); until it's applied this
   returns null and the dashboard shows its existing "your partner" fallback —
   linking is never blocked by a missing name.

Plus an **optional** SQL file `supabase/couple_profile_read.sql` adding a
second `profiles` SELECT policy so couple partners can read each other's
display_name/avatar (OR'd with the existing read-own policy; exposes nothing
beyond your own partner's name+avatar). RLS change → takes effect immediately,
no rebuild.

## Files changed
- `lib/couple.ts` — `fetchActiveCouple` rewritten: plain couple-row select +
  separate best-effort partner-profile lookup; removed the unresolved embed and
  the `normaliseEmbed` helper it needed.
- `supabase/couple_profile_read.sql` — NEW. "profiles: read couple partner"
  RLS policy (optional, for showing the partner's name).

## Verification

1. Rebuild + install on both phones.
2. Phone A: generate code → waiting room. Phone B: enter code → links.
3. **Phone A auto-advances to the dashboard within ~1–3 s** (the poll's
   `fetchActiveCouple` now returns the linked row instead of erroring).
4. Kill + reopen either phone → the linked dashboard rehydrates (previously it
   silently dropped to "not linked" because hydration used the same broken
   query).
5. (Optional) Run `supabase/couple_profile_read.sql` → the partner's real name
   shows on both dashboards instead of "your partner".

## Notes

- JS change → release rebuild needed on BOTH phones.
- This is the actual fix for "creator stuck"; #095's pending-realtime + poll
  are still correct and now function because the query they depend on works.
- Wallpaper-still-not-switching is a separate, later step (both phones must
  grant "Allow all the time" location so proximity can be computed).
