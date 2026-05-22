import { type Href, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { premiumAlert } from '../components/PremiumAlert';
import { useAuthStore } from '../store/auth';

type RequireAuthOpts = {
  /** Override the modal title shown to anonymous users. */
  title?: string;
  /** Override the modal message shown to anonymous users. */
  message?: string;
  /** Route to bounce back to after successful sign-in. Defaults to current. */
  returnTo?: Href;
};

/**
 * Soft-gate hook. `requireAuth(action)` runs `action()` if the user is signed
 * in; otherwise shows the premium alert and routes to `/(auth)/login`.
 *
 * Usage:
 *   const { user, requireAuth } = useRequireAuth();
 *   <Pressable onPress={() => requireAuth(() => toggleFavorite(id))} />
 */
export function useRequireAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  const requireAuth = useCallback(
    (action: () => void, opts: RequireAuthOpts = {}) => {
      if (status === 'authed' && user) {
        action();
        return;
      }
      // Bootstrap still loading — bounce silently; user will retry once UI settles.
      if (status === 'loading') return;

      premiumAlert({
        title: opts.title ?? 'Sign in required',
        message:
          opts.message ??
          "Sign in to save favorites, generate wallpapers, and pair with your partner.",
        icon: 'lock-closed-outline',
        buttons: [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Sign in',
            onPress: () =>
              router.push({
                pathname: '/(auth)/login',
                params: opts.returnTo ? { returnTo: String(opts.returnTo) } : {},
              }),
          },
        ],
      });
    },
    [router, status, user],
  );

  return { user, isAuthed: status === 'authed', requireAuth };
}
