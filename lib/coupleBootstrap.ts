import { useAuthStore } from '../store/auth';
import { useCoupleStore } from '../store/couple';
import {
  fetchActiveCouple,
  fetchCoupleSettings,
  fetchPartnerLocation,
  subscribeCouple,
} from './couple';
import {
  refreshCoupleGeofence,
  startCoupleLocation,
  stopCoupleLocation,
} from './coupleLocation';
import {
  applyProximityWallpaper,
  precacheActiveCouplePack,
} from './coupleWallpaper';

/**
 * Couple feature bootstrap. Call once from `app/_layout.tsx` after auth
 * has hydrated. Idempotent across Fast Refresh.
 *
 * Responsibilities:
 *   1. On every signed-in app launch, fetch the active couple (if any),
 *      its shared settings, and the partner's last known GPS, and push
 *      them into the store.
 *   2. If the couple is `linked`, open the realtime channel and start
 *      the background location task + geofence.
 *   3. On sign-out, tear everything down.
 *
 * Sign-in/out is handled by subscribing to the auth store so we don't
 * have to retrofit a callback into the auth flow.
 */

let booted = false;
let unsubscribeRealtime: (() => void) | null = null;
// The couple code we currently hold an open realtime channel for. Lets both
// the pending and linked paths dedup re-subscribes and lets the pending branch
// of the store subscriber avoid double-opening the channel syncForUser opened.
let subscribedCode: string | null = null;
let lastUserId: string | null = null;
// Dedup key for the linked-mode side-effects. Keyed on `${userId}:${code}`
// (not the bare code) so that a sign-out → sign-in to the SAME couple in one
// JS runtime — which keeps these module-scope guards alive — still restarts
// realtime + the location task instead of early-returning. Reset in
// `exitLinkedMode` so a re-link after an unlink always re-arms too.
let lastCoupleKey: string | null = null;

export async function bootstrapCoupleFeature(): Promise<void> {
  if (booted) return;
  booted = true;

  // Sync once with the current auth state, then react to changes.
  await syncForUser(useAuthStore.getState().user?.id ?? null);

  useAuthStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id) {
      void syncForUser(state.user?.id ?? null);
    }
  });

  // React to link changes too — when the user accepts a code on this
  // device, or unlinks, the side-effects (start/stop location, open/
  // close realtime) live here so the UI handlers stay simple.
  useCoupleStore.subscribe((state, prev) => {
    const a = state.link?.code ?? null;
    const b = prev.link?.code ?? null;
    if (a === b && state.link?.status === prev.link?.status) return;
    if (state.link?.status === 'linked' && a) {
      void enterLinkedMode(a, state.link.partner?.id ?? null);
    } else if (state.link?.status === 'pending' && a) {
      // A pending couple created IN-SESSION (the "Generate code" path) must
      // keep its realtime channel OPEN so the waiting room auto-advances the
      // instant the partner accepts. Without this the subscriber fell into the
      // else branch below and tore the channel down — leaving the creator
      // stranded on "Waiting for your partner…". syncForUser covers the cold-
      // boot case; this covers the same-session case it never sees.
      enterPendingMode(a);
    } else {
      void exitLinkedMode();
    }
  });

  // The geofence has to follow the partner's pin, so re-arm whenever a
  // realtime update changes their position.
  useCoupleStore.subscribe((state, prev) => {
    if (
      state.link?.status === 'linked' &&
      (state.partnerLat !== prev.partnerLat || state.partnerLng !== prev.partnerLng)
    ) {
      void refreshCoupleGeofence();
    }
    // Proximity flipped → re-evaluate wallpaper. (Also re-runs on every
    // location update inside the location task, but this catches the
    // "partner moved across our threshold" case too.)
    if (state.proximity !== prev.proximity) {
      void applyProximityWallpaper();
    }
    // Pack swap → precache new images AND apply immediately so the
    // user sees the change without waiting for the next location tick.
    if (state.couplePackId !== prev.couplePackId) {
      void precacheActiveCouplePack();
      void applyProximityWallpaper();
    }
  });
}

async function syncForUser(userId: string | null): Promise<void> {
  if (userId === lastUserId) return;
  lastUserId = userId;

  // Tear down any previous user's state first — never leak partner GPS
  // across an account switch.
  await exitLinkedMode();
  useCoupleStore.getState().reset();

  if (!userId) {
    useCoupleStore.getState().setHydrated(true);
    return;
  }

  const link = await fetchActiveCouple();
  useCoupleStore.getState().setLink(link);
  useCoupleStore.getState().setHydrated(true);

  if (link?.status === 'linked') {
    await enterLinkedMode(link.code, link.partner?.id ?? null);
  } else if (link?.status === 'pending') {
    // Even pending couples need realtime so the creator's screen
    // auto-advances when the partner accepts. No location task yet —
    // there's nobody to be near.
    enterPendingMode(link.code);
  }
}

/**
 * Open (only) the realtime channel for a pending couple — no location task,
 * since there's no partner to be near yet. Idempotent: skips if we already
 * hold the channel for this code, so the store subscriber and syncForUser
 * can both call it without double-subscribing.
 */
function enterPendingMode(code: string): void {
  if (subscribedCode === code && unsubscribeRealtime) return;
  unsubscribeRealtime?.();
  unsubscribeRealtime = subscribeCouple(code);
  subscribedCode = code;
}

async function enterLinkedMode(
  code: string,
  partnerId: string | null,
): Promise<void> {
  // Key the dedup on user+code so re-linking the same code after a
  // sign-out/sign-in (which leaves these module guards intact) still
  // restarts realtime + location instead of skipping it.
  const userId = useAuthStore.getState().user?.id ?? null;
  const key = `${userId ?? 'anon'}:${code}`;
  if (lastCoupleKey === key) return;
  lastCoupleKey = key;

  // Hydrate shared settings + partner GPS before turning on realtime so
  // the first realtime payload doesn't race with a stale store read.
  const settings = await fetchCoupleSettings(code);
  if (settings) useCoupleStore.getState().setCoupleSettings(settings);

  if (partnerId) {
    const loc = await fetchPartnerLocation(code, partnerId);
    if (loc) {
      useCoupleStore
        .getState()
        .setPartnerLocation(loc.lat, loc.lng, loc.updatedAt, loc.accuracy);
    }
  }

  unsubscribeRealtime?.();
  unsubscribeRealtime = subscribeCouple(code);
  subscribedCode = code;

  // Pre-cache pack images so the first locked-screen tick has local
  // files to apply without a network round-trip. Fire-and-forget.
  void precacheActiveCouplePack();

  await startCoupleLocation();
  await refreshCoupleGeofence();
  await applyProximityWallpaper();
}

async function exitLinkedMode(): Promise<void> {
  // Clear the dedup key so the next enterLinkedMode (even for the same
  // code) re-arms realtime + location from scratch.
  lastCoupleKey = null;
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  subscribedCode = null;
  await stopCoupleLocation();
}
