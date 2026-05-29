package expo.modules.shuffleforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Re-arms the wallpaper shuffle after a device reboot.
 *
 * AlarmManager alarms are cleared by the OS on reboot, so without this shuffle
 * would silently stop until the user next opened the app. This receiver was
 * specified in change 081 and lost when the module was recreated in change 138
 * (which reverted shuffle to a Handler.postDelayed loop) — restoring it brings
 * shuffle in line with the SleepWake / ContextMood modules.
 *
 * It only resumes when persisted URIs are present. `tearDown()` (explicit stop)
 * clears them, while onDestroy does not — so presence == "shuffle was on when
 * we powered down," whether shut down cleanly or killed by the OEM.
 *
 * Static (manifest-declared) so the system delivers BOOT_COMPLETED with the app
 * process dead; receiving that broadcast grants the exemption to start the
 * foreground service from the background on Android 12+. A fresh start (no
 * EXTRA_FIRE) only arms the next alarm — it doesn't re-flash the wallpaper.
 */
class ShuffleBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }
    val prefs = context.getSharedPreferences(
      ShuffleForegroundService.PREFS,
      Context.MODE_PRIVATE,
    )
    val uris = prefs.getString(ShuffleForegroundService.KEY_URIS, "") ?: ""
    if (uris.isEmpty()) return // feature wasn't active — nothing to resume

    val svc = Intent(context, ShuffleForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
