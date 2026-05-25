package expo.modules.contextmoodforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Manifest-declared receiver for the exact alarm scheduled by
 * `ContextMoodForegroundService.scheduleNext()`. Static so the system can
 * deliver the alarm even after our process was killed — an exact/allow-while-
 * idle alarm firing grants a short power allowlist, so starting the foreground
 * service from here is permitted on Android 12+. The service re-arms the next
 * alarm, keeping that logic in one place.
 */
class ContextMoodAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val svc = Intent(context, ContextMoodForegroundService::class.java).apply {
      putExtra(ContextMoodForegroundService.EXTRA_FIRE, true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
