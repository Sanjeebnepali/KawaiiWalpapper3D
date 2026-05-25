/**
 * In-app shortcuts to the device settings that decide whether our
 * background features (shuffle / mood / friend / sleep-wake) survive when
 * the app is closed.
 *
 * Why this exists: on Vivo OriginOS, MIUI, ColorOS, OneUI, HyperOS the OEM
 * kills third-party background work no matter how correctly we schedule
 * it, and Doze defers our alarms by up to an hour. The ONLY fix is the
 * user flipping two device settings — battery "No restrictions" and
 * "Autostart / Allow background activity" — which live in different places
 * on every brand and are hard to find. Rather than telling users to go
 * hunting, these helpers deep-link them straight there in one tap.
 *
 * Android-only — on iOS none of this applies (no programmatic wallpaper).
 * All calls are best-effort: each tries the most specific intent first
 * and falls back gracefully, never throwing into the UI.
 */

import { Alert, Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { isIgnoringBatteryOptimizations } from '../modules/shuffle-foreground';
import { useSettingsStore } from '../store/settings';

function packageName(): string {
  const fromConfig = (Constants.expoConfig as { android?: { package?: string } } | null)
    ?.android?.package;
  return fromConfig ?? 'com.kawaii.wallpapers';
}

function packageData(): string {
  return `package:${packageName()}`;
}

/**
 * Ask the OS to exempt us from battery optimization. Tries, in order:
 *   1. The ONE-TAP "let it always run" system dialog
 *      (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — needs the matching
 *      permission, declared in the shuffle-foreground manifest).
 *   2. The full battery-optimization app list.
 *   3. Our app-details page (battery toggle lives one tap in).
 */
export async function openBatteryOptimization(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: packageData() },
    );
    return;
  } catch {
    /* permission not present / OEM blocks it — fall through */
  }
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
    return;
  } catch {
    /* fall through */
  }
  await openAppDetails();
}

/**
 * Open the Android 12+ "Alarms & reminders" (exact-alarm) permission screen for
 * our app, so the Sleep/Wake swap fires to the exact minute (changes/162). On
 * Android < 12 there's no such screen; falls back to app-details. The feature
 * still works without it (inexact Doze alarm, a few minutes late).
 */
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_SCHEDULE_EXACT_ALARM',
      { data: packageData() },
    );
    return;
  } catch {
    /* older Android / OEM without the screen — app details has it */
  }
  await openAppDetails();
}

/** Open our app's system "App info" page (battery, autostart, permissions
 *  and notifications all branch from here). Universal fallback. */
export async function openAppDetails(): Promise<void> {
  if (Platform.OS !== 'android') {
    Linking.openSettings();
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.APPLICATION_DETAILS_SETTINGS',
      { data: packageData() },
    );
  } catch {
    Linking.openSettings();
  }
}

/**
 * OEM "Autostart" / "Allow background" screens. There is no standard
 * Android API for this, so we try each brand's known component by name.
 * Vivo is first because the project's primary test device (V2231) is a
 * Vivo. The first one that resolves wins; if none do (stock Android /
 * unknown OEM) we land the user on the app-info page.
 */
const AUTOSTART_TARGETS: Array<{ packageName: string; className: string }> = [
  // Vivo (Funtouch OS / OriginOS)
  {
    packageName: 'com.vivo.permissionmanager',
    className: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity',
  },
  {
    packageName: 'com.iqoo.secure',
    className: 'com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity',
  },
  {
    packageName: 'com.iqoo.secure',
    className: 'com.iqoo.secure.ui.phoneoptimize.BgStartUpManager',
  },
  // Xiaomi / Redmi / POCO (MIUI / HyperOS)
  {
    packageName: 'com.miui.securitycenter',
    className: 'com.miui.permcenter.autostart.AutoStartManagementActivity',
  },
  // Oppo / Realme (ColorOS)
  {
    packageName: 'com.coloros.safecenter',
    className: 'com.coloros.safecenter.permission.startup.StartupAppListActivity',
  },
  {
    packageName: 'com.coloros.safecenter',
    className: 'com.coloros.safecenter.startupapp.StartupAppListActivity',
  },
  {
    packageName: 'com.oppo.safe',
    className: 'com.oppo.safe.permission.startup.StartupAppListActivity',
  },
  // Huawei / Honor (EMUI / MagicOS)
  {
    packageName: 'com.huawei.systemmanager',
    className: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity',
  },
  {
    packageName: 'com.huawei.systemmanager',
    className: 'com.huawei.systemmanager.optimize.process.ProtectActivity',
  },
  // Samsung (OneUI) — device care
  {
    packageName: 'com.samsung.android.lool',
    className: 'com.samsung.android.sm.ui.battery.BatteryActivity',
  },
];

/** Try to open the OEM autostart/background-allow screen. Returns true if
 *  one resolved; otherwise lands on app-info and returns false. */
export async function openAutostartSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  for (const t of AUTOSTART_TARGETS) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: t.packageName,
        className: t.className,
      });
      return true;
    } catch {
      /* this OEM component isn't present — try the next */
    }
  }
  await openAppDetails();
  return false;
}

/** Is the app exempt from battery optimization (Doze)? When false, our
 *  background alarms get deferred (up to hours) by the OS and the features
 *  feel "stopped." Always true on iOS / unlinked module so callers don't
 *  nag where it doesn't apply. */
export function isBatteryWhitelisted(): boolean {
  if (Platform.OS !== 'android') return true;
  return isIgnoringBatteryOptimizations();
}

/**
 * Nudge the user to the battery setting IF — and only if — the app is not
 * yet exempt from battery optimization. Called when a background feature
 * is enabled AND at launch when one is already active (so it catches the
 * case where features were on before this build and the on-enable prompt
 * never fired).
 *
 * Behaviour:
 *   - Already whitelisted → never prompts (nothing to fix).
 *   - Not whitelisted → prompts at most once per app session, and
 *     re-offers on the NEXT session if still not whitelisted, because the
 *     background features genuinely don't work on time until it's done.
 *   - No-op on iOS.
 */
let promptedThisSession = false;
export function maybePromptBackgroundAccess(): void {
  if (Platform.OS !== 'android') return;
  if (promptedThisSession) return;
  // Persisted gate — a user who already saw (and likely declined) the
  // auto-prompt in a previous session shouldn't be re-nagged on every cold
  // start while a background feature is on. The flag was previously
  // write-only; reading it here suppresses the re-nag. The manual triggers
  // (Settings → Background Access buttons → openBatteryOptimization /
  // openAutostartSettings) are unaffected — they don't route through here.
  if (useSettingsStore.getState().bgAccessPrompted) return;
  // Already exempt → nothing to nag about.
  if (isBatteryWhitelisted()) return;
  promptedThisSession = true;
  useSettingsStore.getState().set('bgAccessPrompted', true);

  setTimeout(() => {
    Alert.alert(
      'One step to make it work',
      'Your phone is set to stop Kawaii Baby in the background, so timed wallpaper changes won’t fire on time. Tap “Fix it” and choose Allow / “Don’t optimize” / “No restrictions”. You only do this once.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Fix it', onPress: () => void openBatteryOptimization() },
      ],
    );
  }, 700);
}
