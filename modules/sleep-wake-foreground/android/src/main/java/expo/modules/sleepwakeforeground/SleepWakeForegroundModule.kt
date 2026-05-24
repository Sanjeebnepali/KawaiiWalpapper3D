package expo.modules.sleepwakeforeground

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for the time-of-day wake/sleep wallpaper foreground service.
 * Android-only; iOS gets no native module and the JS layer no-ops.
 *
 * JS contract (see ../../index.ts):
 *   start(wakeUri: String, sleepUri: String, wakeHour: Int, sleepHour: Int): void
 *   stop(): void
 *   isRunning(): Boolean
 *
 * `start` hands the config to the service via Intent extras and launches it
 * in the foreground. `isRunning` reads the service's volatile flag directly
 * (no IPC needed — same process).
 */
class SleepWakeForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SleepWakeForeground")

    Function("start") { wakeUri: String, sleepUri: String, wakeHour: Int, sleepHour: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, SleepWakeForegroundService::class.java).apply {
        putExtra(SleepWakeForegroundService.EXTRA_WAKE_URI, wakeUri)
        putExtra(SleepWakeForegroundService.EXTRA_SLEEP_URI, sleepUri)
        putExtra(SleepWakeForegroundService.EXTRA_WAKE_HOUR, wakeHour)
        putExtra(SleepWakeForegroundService.EXTRA_SLEEP_HOUR, sleepHour)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.stopService(Intent(context, SleepWakeForegroundService::class.java))
    }

    Function("isRunning") {
      SleepWakeForegroundService.isRunning
    }
  }
}
