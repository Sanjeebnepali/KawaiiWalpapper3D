package expo.modules.sleepwakeforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Re-arms the Sleep/Wake wallpaper swap after a device reboot.
 *
 * AlarmManager alarms are cleared by the OS on reboot, so without this the
 * wake/sleep swap would silently stop until the user next opened the app. This
 * receiver was lost when the module was recreated in change 138 — restoring it
 * closes the reboot gap `KNOWN_ISSUES.md` claimed was handled (change 082).
 *
 * It only resumes when persisted config is present. `tearDown()` (explicit
 * stop) clears it, while onDestroy does not — so presence == "Sleep/Wake was on
 * when we powered down," whether shut down cleanly or killed by the OEM.
 *
 * Static (manifest-declared) so the system delivers BOOT_COMPLETED with the app
 * process dead; receiving that broadcast grants the exemption to start the
 * foreground service from the background on Android 12+.
 */
class SleepWakeBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }
    val prefs = context.getSharedPreferences(
      SleepWakeForegroundService.PREFS,
      Context.MODE_PRIVATE,
    )
    val wakeUri = prefs.getString(SleepWakeForegroundService.EXTRA_WAKE_URI, "") ?: ""
    if (wakeUri.isEmpty()) return // feature wasn't active — nothing to resume

    // Fresh start (no fire slot) → the service re-reads the persisted pair +
    // hours and arms the next wake/sleep boundary.
    val svc = Intent(context, SleepWakeForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
