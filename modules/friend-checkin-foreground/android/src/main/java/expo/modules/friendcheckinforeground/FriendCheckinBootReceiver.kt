package expo.modules.friendcheckinforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Re-arms the friend check-in tick after a device reboot.
 *
 * AlarmManager alarms are cleared by the OS on reboot, so without this the
 * check-in prompts would silently stop until the user next opened the app. This
 * receiver was missing when the module was recreated in change 138 — restoring
 * it (alongside the non-destructive onDestroy in the service) closes the reboot
 * gap and matches the SleepWake / ContextMood modules.
 *
 * It only resumes when a persisted interval is present. `tearDown()` (explicit
 * stop) clears it, while onDestroy does not — so presence == "friend check-in
 * was on when we powered down," whether shut down cleanly or killed by the OEM.
 *
 * Static (manifest-declared) so the system delivers BOOT_COMPLETED with the app
 * process dead; receiving that broadcast grants the exemption to start the
 * foreground service from the background on Android 12+.
 */
class FriendCheckinBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }
    val prefs = context.getSharedPreferences(
      FriendCheckinForegroundService.PREFS_NAME,
      Context.MODE_PRIVATE,
    )
    // -1 == no persisted interval → feature wasn't active; nothing to resume.
    if (prefs.getInt(FriendCheckinForegroundService.KEY_INTERVAL_MINUTES, -1) <= 0) return

    // Fresh start (no EXTRA_FIRE) → the service re-reads the persisted interval
    // and arms the next tick.
    val svc = Intent(context, FriendCheckinForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
