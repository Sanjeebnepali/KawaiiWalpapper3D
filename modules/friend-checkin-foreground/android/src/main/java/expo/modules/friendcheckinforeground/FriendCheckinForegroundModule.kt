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
 *   AlarmManager-backed triggers get coalesced by Doze / app-standby / OEM
 *   battery savers, so prompts arrive in a burst when the user finally opens
 *   the app instead of on the requested cadence. A foreground service running
 *   `Handler.postDelayed` is exempt — the OS treats it as user-requested
 *   ongoing work and lets it tick reliably.
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
      context.stopService(Intent(context, FriendCheckinForegroundService::class.java))
    }

    Function("isRunning") {
      FriendCheckinForegroundService.isRunning
    }
  }

  /** Called by the service on every `Handler.postDelayed` tick. */
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
