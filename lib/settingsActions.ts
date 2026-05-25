import { Share } from 'react-native';
import { premiumAlert } from '../components/PremiumAlert';
import { useAIStore } from '../store/ai';
import { useShuffleStore } from '../store/shuffle';
import { toast } from './settingsConstants';
import { startForegroundShuffleForCollection } from './shuffleActions';
import { clearAppCache } from './wallpaperActions';

/**
 * Settings-screen action handlers, extracted verbatim from the screen body.
 * These are plain closures (NOT hooks) — each factory takes the values it
 * captured in the component (favorites, auth callbacks, profile) as args and
 * returns the same handler the screen used inline. Keeping them out of the
 * screen keeps `app/(tabs)/profile.tsx` under the file-size cap without
 * touching any hook call.
 */

/** Share the favorites list as a JSON blob. */
export function makeExportData(favIds: string[]) {
  return () => {
    const json = JSON.stringify({ favorites: favIds }, null, 2);
    Share.share({ message: json, title: 'Kawaii favorites export' });
  };
}

/** Confirm + perform the local-only account/data wipe. */
export function makeConfirmDelete(
  clearFavorites: () => void,
  signOut: () => Promise<void>,
) {
  return () =>
    premiumAlert({
      title: 'Delete Account',
      message:
        'This signs you out and wipes the favorites + AI history saved on this device. The server-side account stays for now — email support to fully remove it.',
      icon: 'warning-outline',
      accentColor: '#FF7A6E',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete local data',
          style: 'destructive',
          onPress: async () => {
            // Local-side wipe — favorites + AI history + auth session.
            // Doesn't reach into the Supabase `profiles` table; a true
            // server-side delete needs an admin endpoint we haven't
            // built yet. The toast tells the user what actually
            // happened so they're not misled.
            clearFavorites();
            await useAIStore.getState().resetAll();
            try {
              await signOut();
            } catch {
              /* in-memory wipe still succeeded */
            }
            toast('Local data cleared · signed out');
          },
        },
      ],
    });
}

/** Clear the app cache, then re-arm any active foreground shuffle. */
export function makeClearCache() {
  return async () => {
    const r = await clearAppCache();
    if (!r.ok) {
      toast('Could not clear cache');
      return;
    }
    // Clearing the cache deletes the precached `kawaii-*.jpg` pool the
    // native foreground service rotates through — every subsequent
    // decodeFile would return null and silently apply nothing. If a shuffle
    // is active, re-precache + re-arm it so the file:// pool is re-downloaded
    // and rotation doesn't die quietly until the next app reopen.
    const { activeCollectionId, collections } = useShuffleStore.getState();
    if (activeCollectionId) {
      const active = collections.find((c) => c.id === activeCollectionId);
      if (active) void startForegroundShuffleForCollection(active);
    }
    const mb = (r.bytes / 1_048_576).toFixed(1);
    toast(r.bytes > 0 ? `✓ Cache cleared · ${mb} MB freed` : '✓ Cache already empty');
  };
}

/** Confirm + perform sign-out. */
export function makeConfirmLogout(signOut: () => Promise<void>) {
  return () =>
    premiumAlert({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      icon: 'log-out-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
      ],
    });
}
