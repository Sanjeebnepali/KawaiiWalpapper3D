import type { Session, Subscription, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAIStore } from './ai';
import { useFavoritesStore } from './favorites';

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  /** Key into `constants/avatars.ts` — e.g. 'bunny', 'star'. Nullable until profile-setup runs. */
  avatar_id: string | null;
  invite_code: string;
};

export type AuthStatus = 'loading' | 'authed' | 'anon';

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Set once on app boot. Idempotent across Fast Refresh. */
  bootstrap: () => Promise<void>;
  /**
   * Email + password — create a new account. With "Confirm email" turned OFF
   * in the Supabase dashboard, this returns a session immediately and logs the
   * user straight in (no email is ever sent). The `handle_new_user` DB trigger
   * creates their `profiles` row on the auth.users insert.
   */
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Email + password — sign into an existing account. */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Re-fetch the row in `public.profiles` for the current user. */
  refreshProfile: () => Promise<void>;
};

let bootstrapped = false;
// Module-scope handle to the onAuthStateChange listener so we can unsubscribe
// the previous one before re-subscribing (CORE-1). Fast Refresh re-evaluates
// this module and resets `bootstrapped`, which would otherwise stack a fresh
// listener on top of the old — every auth event then fires refreshProfile()
// once per stacked listener, plus the dead listeners leak for the process'
// lifetime.
let authSubscription: Subscription | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  user: null,
  profile: null,

  bootstrap: async () => {
    if (bootstrapped) return;

    // Drop any listener from a prior module evaluation (Fast Refresh) before
    // wiring a new one, so we never run duplicates.
    authSubscription?.unsubscribe();
    authSubscription = null;

    try {
      const { data } = await supabase.auth.getSession();
      applySession(set, data.session);
      if (data.session) void get().refreshProfile();

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        applySession(set, session);
        if (session) void get().refreshProfile();
        else set({ profile: null });
      });
      authSubscription = sub.subscription;

      // Only mark bootstrap complete after a successful getSession + listener
      // setup. If getSession() throws (corrupt session blob, bridge not ready),
      // we fall to the catch below WITHOUT setting this — so a later retry can
      // re-attempt instead of being stranded in `status: 'loading'` (CORE-3).
      bootstrapped = true;
    } catch (e) {
      // Self-heal: treat a failed boot as "signed out" rather than leaving the
      // app pinned in `loading` forever (every useRequireAuth gate would
      // silently no-op). bootstrapped stays false so a subsequent call retries.
      console.error('[auth] bootstrap failed:', e);
      set({ status: 'anon' });
    }
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      // Surface the raw Supabase error in Metro/logcat so we can extend the
      // friendly-error classifier when a new failure mode shows up.
      console.error('[auth] signUp error:', error.message, JSON.stringify(error));
    }
    return { error: error?.message ?? null };
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      console.error('[auth] signIn error:', error.message, JSON.stringify(error));
    }
    return { error: error?.message ?? null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // Shared-device privacy (CORE-2 / H5): wipe every per-user store so the
    // next user doesn't inherit the previous user's data. Favorites + AI
    // state live in their own stores; profile/session/user reset locally here.
    useFavoritesStore.getState().clear();
    // resetAll() (NOT reset()) — the in-memory-only reset() left the persisted
    // '@kawaii/ai@v1' blob on disk, so the next launch re-hydrated the prior
    // user's API tokens (hf/openai/gemini/poll — and their billing), their
    // generation history, and their consumed daily quota. resetAll() also
    // removes the disk blob, so the next user starts with NO tokens, NO
    // history, and NO inherited quota (dailyGen). Awaited so the wipe lands
    // before the screen transitions; log on the (best-effort) failure path.
    try {
      await useAIStore.getState().resetAll();
    } catch (e) {
      console.error('[auth] signOut: AI resetAll failed:', e);
    }
    set({ profile: null, user: null, session: null, status: 'anon' });
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) {
      set({ profile: null });
      return;
    }
    // One-time retry (CORE-6): a transient fetch failure used to be silently
    // swallowed, leaving `profile` null — the verify gate then mistakes
    // "fetch failed" for "profile incomplete" and forces profile-setup. Log
    // the error and try once more before giving up so we only ever gate on a
    // genuine result.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, avatar_id, invite_code')
        .eq('id', user.id)
        .maybeSingle();
      if (!error && data) {
        set({ profile: data as Profile });
        return;
      }
      if (error) {
        console.error(
          `[auth] refreshProfile error (attempt ${attempt + 1}/2):`,
          error.message,
        );
      } else {
        // No row yet — the DB trigger may not have created it. Don't retry a
        // legitimately empty result; leave profile as-is.
        return;
      }
    }
  },
}));

function applySession(
  set: (partial: Partial<AuthState>) => void,
  session: Session | null,
) {
  set({
    session,
    user: session?.user ?? null,
    status: session ? 'authed' : 'anon',
  });
}

/** Selector helpers — keep call-sites narrow so they re-render minimally. */
export const useUser = () => useAuthStore((s) => s.user);
export const useAuthStatus = () => useAuthStore((s) => s.status);
export const useIsAuthed = () => useAuthStore((s) => s.status === 'authed');
export const useProfile = () => useAuthStore((s) => s.profile);
