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

import { Alert, AppState, Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { isIgnoringBatteryOptimizations } from '../modules/shuffle-foreground';
import { canScheduleSleepWakeExact } from '../modules/sleep-wake-foreground';
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
  // Vivo "High background power consumption" (com.vivo.abe) — FIRST because on
  // Vivo this is the screen that actually stops the screen-off process FREEZE
  // (PEM / Power Energy Manager). The plain battery "No restrictions" toggle
  // and the autostart list below do NOT cover it: verified on V2231 where an
  // exact alarm fired fine with the screen ON but never fired once locked,
  // even while charging (Doze off) and battery-whitelisted (changes/190). If
  // this component resolves, the user lands exactly where the fix lives.
  {
    packageName: 'com.vivo.abe',
    className:
      'com.vivo.applicationbehaviorengine.ui.ExcessivePowerManagerActivity',
  },
  // Vivo (Funtouch OS / OriginOS) autostart / background-start manager.
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
 * Open the battery-exemption setting AND verify it actually took effect when the
 * user comes back. On Vivo (and some MIUI/ColorOS builds) the standard
 * "Allow / Don't optimize" dialog can be tapped without the system actually
 * recording the exemption — verified on a V2231 where `isBatteryWhitelisted()`
 * stayed false after the user tapped Allow (changes/191). Tapping a button that
 * silently does nothing is the worst UX, so we re-check on return and, if it
 * still didn't take, show an explicit "it didn't save — here's exactly what to
 * tap" follow-up that reopens the setting.
 *
 * One-shot: the AppState listener removes itself after the first foreground
 * return (or after a 90s safety timeout) so it never leaks or re-fires on
 * later app switches.
 */
function openBatteryThenVerify(): void {
  void openBatteryOptimization();

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const sub = AppState.addEventListener('change', (next) => {
    // Only act on the return-to-foreground transition.
    if (next !== 'active' || settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    sub.remove();

    // Small delay so the OS has committed the exemption before we read it back —
    // the whitelist query can lag the settings write by a beat on some OEMs.
    setTimeout(() => {
      if (isBatteryWhitelisted()) return; // it took — nothing to do.
      Alert.alert(
        'That didn’t save — one more try',
        'Your phone didn’t record the change, so timed wallpaper changes will still stop when the screen is off. On the next screen, set Kawaii Baby to “Don’t optimize” / “No restrictions” / “Allow”, then come back.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Open again', onPress: () => void openBatteryOptimization() },
        ],
      );
    }, 600);
  });

  // Safety: if the user never returns (or AppState misses the event on an OEM),
  // tear the listener down after 90s so it can't linger or fire stale.
  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    sub.remove();
  }, 90_000);
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
  // Battery prompt already handled in a PRIOR session → don't re-nag for
  // battery, but this is the right moment to offer the SEPARATE exact-alarm
  // grant (so the two never appear stacked — they land in different sessions).
  if (useSettingsStore.getState().bgAccessPrompted) {
    maybePromptExactAlarm();
    return;
  }
  // Already exempt from battery optimization → nothing to nag about for
  // battery; chain to the exact-alarm prompt instead (it has its own gate).
  if (isBatteryWhitelisted()) {
    maybePromptExactAlarm();
    return;
  }
  promptedThisSession = true;
  useSettingsStore.getState().set('bgAccessPrompted', true);

  setTimeout(() => {
    // Vivo/MIUI/ColorOS need TWO separate settings — battery "No restrictions"
    // AND "Autostart / Allow background". Battery alone is NOT enough on these
    // OEMs (the autostart manager is a separate gate that freezes the app and
    // blocks the alarm-triggered foreground-service start), which is exactly
    // why timed changes "only work when the app is open." Offer both.
    Alert.alert(
      'Keep wallpaper changes running',
      'Phones like Vivo, Xiaomi and Oppo freeze Kawaii Baby once the screen is off, so timed changes (Shuffle / Mood / Sleep-Wake) stop while the phone is locked. Turn ON all of these — you only do this once:\n\n1) Allow background / Autostart\n2) Battery → No restrictions\n3) On Vivo: tap “Background power” and ALLOW high background power use (this is the one that stops the screen-off freeze)\n\nTip: also open Recent apps and LOCK the Kawaii Baby card so the system can’t clear it.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Battery', onPress: () => openBatteryThenVerify() },
        { text: 'Background power', onPress: () => void openAutostartSettings() },
      ],
    );
  }, 700);
}

/**
 * Nudge the user to grant the Android 12+ "Alarms & reminders" (exact-alarm)
 * permission, which is what makes timed wallpaper changes fire to the MINUTE
 * instead of being deferred to a Doze maintenance window (the "I set 9 AM but it
 * changed at 10 AM" / "mood only changes every few hours" symptoms).
 *
 * We deliberately use `SCHEDULE_EXACT_ALARM` (user-granted) rather than
 * `USE_EXACT_ALARM` (auto-granted) because Google Play restricts the latter to
 * alarm/clock/calendar apps — a wallpaper app would risk rejection (changes/188).
 * The trade-off is this one-tap prompt.
 *
 * Gating mirrors `maybePromptBackgroundAccess`:
 *   - Already grantable (`canScheduleSleepWakeExact()` true → Android < 12, or
 *     already granted) → never prompts.
 *   - Otherwise → at most once per session, once per install (persisted flag),
 *     and NEVER in the same tick as the battery prompt (see the caller).
 *   - No-op on iOS.
 */
let exactAlarmPromptedThisSession = false;
export function maybePromptExactAlarm(): void {
  if (Platform.OS !== 'android') return;
  if (exactAlarmPromptedThisSession) return;
  if (useSettingsStore.getState().exactAlarmPrompted) return;
  // Already granted (or pre-Android-12 where it's implicit) → nothing to ask.
  if (canScheduleSleepWakeExact()) return;
  exactAlarmPromptedThisSession = true;
  useSettingsStore.getState().set('exactAlarmPrompted', true);

  setTimeout(() => {
    Alert.alert(
      'Make timed changes exact',
      'To change your wallpaper at the exact time you set (instead of up to an hour late), allow “Alarms & reminders” for Kawaii Baby. You only do this once.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Allow', onPress: () => void openExactAlarmSettings() },
      ],
    );
  }, 700);
}
