package expo.modules.contextmoodforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Re-arms the context-mood automation after a device reboot.
 *
 * AlarmManager alarms are cleared by the OS on reboot, so without this the
 * "auto-change in background" wallpaper would silently stop until the user next
 * opened the app (which restarts the service via bootstrap). This receiver was
 * lost when the module was recreated in change 138 — restoring it closes the
 * reboot gap that `KNOWN_ISSUES.md` claimed was already handled (change 082).
 *
 * It only resumes if persisted config is present. `tearDown()` (explicit stop)
 * wipes that config, so presence == "the feature was on when we powered down."
 * onDestroy does NOT wipe config, so an OEM/low-memory kill before reboot still
 * leaves it set and we correctly resume.
 *
 * Static (manifest-declared) so the system delivers BOOT_COMPLETED even with the
 * app process dead; receiving that broadcast grants the exemption to start the
 * foreground service from the background on Android 12+.
 */
class ContextMoodBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }
    val prefs = context.getSharedPreferences(
      ContextMoodForegroundService.PREFS,
      Context.MODE_PRIVATE,
    )
    val payload = prefs.getString(ContextMoodForegroundService.KEY_PAYLOAD, "") ?: ""
    if (payload.isEmpty()) return // feature wasn't active — nothing to resume

    // Fresh start (no EXTRA_FIRE) → the service re-reads the persisted interval
    // + payload and arms the next alarm. The first tick lands one interval out.
    val svc = Intent(context, ContextMoodForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
