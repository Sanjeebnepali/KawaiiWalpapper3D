package expo.modules.friendcheckinforeground

import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for the friend check-in foreground service. Android-only.
 *
 * Why a foreground service (not expo-notifications TIME_INTERVAL):
 *   plain JS timers are killed when the app is closed. The service stays alive
 *   with an ongoing notification and schedules each next tick with
 *   `AlarmManager.setExactAndAllowWhileIdle` (changes/168), which fires at the
 *   real wall-clock time even in Doze — so the cadence holds while the app is
 *   closed and the screen is off. See FriendCheckinForegroundService for detail.
 *
 * JS contract (see ../../../../../../index.ts):
 *   start(intervalMinutes: Int)  -- clamped 5..1440
 *   stop()
 *   isRunning(): Boolean
 *   onTick event -> { at: <epoch ms> } on each tick
 */
class FriendCheckinForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FriendCheckinForeground")

    Events("onTick")

    OnCreate {
      // The service reaches back to the live module instance to emit ticks.
      instance = this@FriendCheckinForegroundModule
    }

    OnDestroy {
      if (instance === this@FriendCheckinForegroundModule) {
        instance = null
      }
    }

    Function("start") { intervalMinutes: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val clamped = intervalMinutes.coerceIn(5, 1440)
      val intent = Intent(context, FriendCheckinForegroundService::class.java)
        .putExtra("intervalMinutes", clamped)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      // Cancel the alarm + wipe persisted config FIRST (so neither the alarm nor
      // a START_STICKY restart resurrects the service), then stop it. onDestroy
      // no longer does this, so the config survives an OEM kill for resurrection.
      FriendCheckinForegroundService.tearDown(context)
      context.stopService(Intent(context, FriendCheckinForegroundService::class.java))
    }

    Function("isRunning") {
      FriendCheckinForegroundService.isRunning
    }
  }

  /** Called by the service on every alarm-driven tick. */
  fun emitTick() {
    sendEvent("onTick", bundleOf("at" to System.currentTimeMillis()))
  }

  companion object {
    /** Set in OnCreate / cleared in OnDestroy so the service can emit
     *  events back to the live module without a hard reference cycle. */
    @Volatile
    var instance: FriendCheckinForegroundModule? = null
  }
}
