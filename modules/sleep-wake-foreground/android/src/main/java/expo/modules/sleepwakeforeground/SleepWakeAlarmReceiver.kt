package expo.modules.sleepwakeforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Manifest-declared receiver for the exact alarm scheduled by
 * `SleepWakeForegroundService.scheduleNext()`. Because it's static (declared in
 * the manifest, not registered at runtime), the system can deliver the alarm
 * even when our process has been killed — it cold-starts the app just to run
 * this. An exact/allow-while-idle alarm firing also grants a short power
 * allowlist, so starting the foreground service from here is permitted on
 * Android 12+.
 *
 * We hand the work back to the service (rather than decoding the bitmap here)
 * so the heavy `setBitmap` can't blow the ~10s BroadcastReceiver budget, and so
 * the service re-arms the following alarm in one place.
 */
class SleepWakeAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val slot = intent?.getIntExtra(SleepWakeForegroundService.EXTRA_FIRE_SLOT, -1) ?: -1
    val svc = Intent(context, SleepWakeForegroundService::class.java).apply {
      putExtra(SleepWakeForegroundService.EXTRA_FIRE_SLOT, slot)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
