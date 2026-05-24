package expo.modules.shuffleforeground

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only driver for the wallpaper-rotation foreground service. The
 * service owns the timer and applies wallpapers NATIVELY — no JS callback per
 * tick — so OEM background killers (Vivo OriginOS, MIUI, ColorOS) can't pause
 * it the way they throttle expo-background-fetch / WorkManager to nothing.
 *
 * JS contract (see ../../../../../index.ts):
 *   start(uris: List<String>, intervalMs: Double, mode: String, startIndex: Int)
 *   stop()
 *   isRunning(): Boolean
 *   getLastApplied(): { index, at, uri } | null
 *   isIgnoringBatteryOptimizations(): Boolean
 */
class ShuffleForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShuffleForeground")

    // intervalMs arrives from JS as a JS number — accept it as Double so the
    // bridge coercion never fails, then narrow to Long for the Handler delay.
    Function("start") { uris: List<String>, intervalMs: Double, mode: String, startIndex: Int ->
      val context = reactContext()
      val intent = Intent(context, ShuffleForegroundService::class.java).apply {
        putStringArrayListExtra("uris", ArrayList(uris))
        putExtra("intervalMs", intervalMs.toLong())
        putExtra("mode", mode)
        putExtra("startIndex", startIndex)
      }
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      val context = reactContext()
      context.stopService(Intent(context, ShuffleForegroundService::class.java))
    }

    Function("isRunning") {
      ShuffleForegroundService.isRunning
    }

    Function("getLastApplied") {
      val context = reactContext()
      val prefs = context.getSharedPreferences(
        ShuffleForegroundService.PREFS,
        Context.MODE_PRIVATE,
      )
      val uri = prefs.getString(ShuffleForegroundService.KEY_LAST_URI, null)
      if (uri == null || !prefs.contains(ShuffleForegroundService.KEY_LAST_AT)) {
        null
      } else {
        mapOf(
          "index" to prefs.getInt(ShuffleForegroundService.KEY_LAST_INDEX, 0),
          "at" to prefs.getLong(ShuffleForegroundService.KEY_LAST_AT, 0L),
          "uri" to uri,
        )
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val context = reactContext()
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }
  }

  private fun reactContext(): Context =
    appContext.reactContext ?: throw Exceptions.ReactContextLost()
}
