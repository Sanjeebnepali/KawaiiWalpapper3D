package expo.modules.friendcheckinforeground

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Manifest-declared receiver for the exact alarm scheduled by
 * `FriendCheckinForegroundService.scheduleNext()`. Static (declared in the
 * manifest, not registered at runtime) so the system can deliver the alarm even
 * after our process was killed — it cold-starts just to run this. An
 * exact/allow-while-idle alarm firing also grants a short power allowlist, so
 * starting the foreground service from here is permitted on Android 12+.
 *
 * We hand the work back to the service (with EXTRA_FIRE) rather than emitting
 * the tick here, so re-arming the next alarm lives in one place.
 */
class FriendCheckinAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val svc = Intent(context, FriendCheckinForegroundService::class.java).apply {
      putExtra(FriendCheckinForegroundService.EXTRA_FIRE, true)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(svc)
    } else {
      context.startService(svc)
    }
  }
}
