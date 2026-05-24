package expo.modules.contextmoodforeground

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only foreground service driver for the context-mood inference
 * tick. The service ticks every N minutes and emits an `onTick` event back
 * to JS; JS does the actual inference + silent wallpaper apply.
 *
 * JS contract (see ../../../../../index.ts):
 *   start(intervalMinutes: Int)  — clamp 5..1440
 *   stop()
 *   isRunning(): Boolean
 *   onTick event payload: { at: <epoch ms> }
 */
class ContextMoodForegroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ContextMoodForeground")

    Events("onTick")

    OnCreate {
      instance = this@ContextMoodForegroundModule
    }

    OnDestroy {
      if (instance === this@ContextMoodForegroundModule) {
        instance = null
      }
    }

    Function("start") { intervalMinutes: Int ->
      val context = reactContext()
      val clamped = intervalMinutes.coerceIn(5, 1440)
      val intent = Intent(context, ContextMoodForegroundService::class.java)
        .putExtra("intervalMinutes", clamped)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stop") {
      val context = reactContext()
      context.stopService(Intent(context, ContextMoodForegroundService::class.java))
    }

    Function("isRunning") {
      ContextMoodForegroundService.isRunning
    }
  }

  /** Called by the service on each tick to bridge the event to JS. */
  fun emitTick() {
    sendEvent("onTick", bundleOf("at" to System.currentTimeMillis()))
  }

  private fun reactContext(): Context =
    appContext.reactContext ?: throw Exceptions.ReactContextLost()

  companion object {
    /** Set in OnCreate, cleared in OnDestroy. The running service reads
        this to deliver ticks to the live JS bridge. */
    @Volatile
    var instance: ContextMoodForegroundModule? = null
  }
}
