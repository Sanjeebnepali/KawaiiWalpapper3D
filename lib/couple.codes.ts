/**
 * Couple code formatting + RPC error translation.
 *
 * Pure helpers with no Supabase / store dependencies — the leaf of the
 * couple module so the action files can import these freely without any
 * import cycle. Re-exported from `lib/couple.ts` so external importers of
 * `lib/couple` keep working unchanged.
 */

import type { CoupleLink } from '../store/couple';

// ─── Result types ────────────────────────────────────────────────────────

export type CreateCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export type AcceptCodeResult =
  | { ok: true; link: CoupleLink }
  | { ok: false; error: string };

// ─── Helpers ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isWellFormedCode(code: string): boolean {
  if (!code.startsWith('LOVE-')) return false;
  const tail = code.slice(5);
  return tail.length === 4 && CODE_ALPHABET.test(tail);
}

/**
 * Translate a Postgres `raise exception '…'` from the RPCs into something
 * the toast can show. Any unknown message falls through unchanged so we
 * don't hide real bugs from the user.
 */
export function translateError(msg: string): string {
  if (msg.includes('CODE_NOT_FOUND')) return 'No couple with that code.';
  if (msg.includes('CODE_TAKEN')) return 'That code is already taken.';
  if (msg.includes('CODE_REVOKED')) return 'That code was unlinked.';
  if (msg.includes('CANNOT_LINK_SELF')) return "You can't link with yourself.";
  if (msg.includes('ALREADY_LINKED')) return 'You already have an active link.';
  if (msg.includes('NOT_AUTHENTICATED')) return 'Sign in first.';
  if (msg.includes('NOT_YOUR_COUPLE')) return 'This is not your couple.';
  if (msg.includes('BAD_ROLE')) return 'Pick a side first.';
  if (msg.includes('ROLE_TAKEN'))
    return 'Your partner already chose that side — pick the other one.';
  return msg;
}
