package expo.modules.contextmoodforeground

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.WallpaperManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/**
 * The ongoing foreground service for context-mood ("auto-change in background"
 * / "footstep") wallpaper automation.
 *
 * APPLY MODEL (the fix for "only changes when I open the app"): the service
 * APPLIES the wallpaper ITSELF on each tick — it does NOT bounce the work back
 * to JS. JS pre-resolves a `{ moodUris: { <mood>: [file://…] }, all: [file://…] }`
 * payload (see lib/contextMoodForeground.ts) once at start; on each tick the
 * service computes the mood from the time of day, picks a URI from that mood's
 * bucket (falling back to `all`), and calls `WallpaperManager.setBitmap`. No
 * live JS context is required, so it works even when the app process is dead
 * (the normal state on Vivo/MIUI/ColorOS). It still emits `onTick` so a live JS
 * bundle can mirror the mood into history.
 *
 * Timing model (changes/168): the next tick is scheduled with
 * `AlarmManager.setExactAndAllowWhileIdle` (falls back to
 * `setAndAllowWhileIdle`), which fires at real wall-clock time even in Doze —
 * unlike `Handler.postDelayed`, whose clock pauses while the CPU sleeps.
 *
 * Survival: interval + payload are persisted to SharedPreferences; the service
 * is `START_STICKY`; the alarm targets the static `ContextMoodAlarmReceiver` so
 * an OEM-killed service is resurrected at the alarm time; `ContextMoodBootReceiver`
 * re-arms after a reboot. Config is cleared ONLY on an explicit `stop()` (via
 * `tearDown`), NEVER in `onDestroy` — so an OEM/low-memory kill (which may run
 * onDestroy) doesn't wipe the config the resurrection path needs.
 */
class ContextMoodForegroundService : Service() {
  private var intervalMinutes = DEFAULT_INTERVAL_MIN
  private var payloadJson = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    // Resolve interval + payload: explicit extras win (fresh start), else the
    // persisted values (a START_STICKY/alarm/boot restart carries no config).
    val fromExtra = intent?.getIntExtra(EXTRA_INTERVAL, -1) ?: -1
    intervalMinutes = (if (fromExtra > 0) fromExtra else prefs.getInt(KEY_INTERVAL, DEFAULT_INTERVAL_MIN))
      .coerceIn(5, 1440)
    val extraPayload = intent?.getStringExtra(EXTRA_PAYLOAD)
    payloadJson = if (!extraPayload.isNullOrEmpty()) extraPayload else prefs.getString(KEY_PAYLOAD, "") ?: ""
    prefs.edit()
      .putInt(KEY_INTERVAL, intervalMinutes)
      .putString(KEY_PAYLOAD, payloadJson)
      .apply()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, buildNotification())
    }

    isRunning = true

    // If this start came from a fired alarm, apply the wallpaper now and notify
    // any live JS. A fresh start only arms — the first tick lands one interval
    // out (JS does an immediate apply on enable for instant feedback).
    if (intent?.getBooleanExtra(EXTRA_FIRE, false) == true) {
      applyForCurrentMood()
      ContextMoodForegroundModule.instance?.emitTick()
    }

    scheduleNext()
    return START_STICKY
  }

  override fun onDestroy() {
    // Intentionally does NOT cancel the alarm or clear config — a low-memory /
    // OEM kill can trigger onDestroy, and wiping here would prevent the
    // alarm/START_STICKY/boot resurrection from resuming. Explicit stop wipes
    // config via tearDown() from the JS module instead.
    isRunning = false
    super.onDestroy()
  }

  // ─── Wallpaper apply (native — no JS) ─────────────────────────────────────

  /** Compute the current mood, pick a URI for it, and set it as the wallpaper. */
  private fun applyForCurrentMood() {
    if (payloadJson.isEmpty()) return
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val uri = pickUriForMood(moodForHour(hour)) ?: return
    applyUri(uri)
  }

  /**
   * Time-of-day → mood. MUST mirror `inferContextMood` in lib/contextMood.ts
   * (Android path, where step data is always null). Drift here would make the
   * native apply disagree with the mood JS records into history.
   */
  private fun moodForHour(hour: Int): String = when {
    hour >= 5 && hour < 9 -> "neutral"   // early morning, settling in
    hour >= 9 && hour < 11 -> "excited"  // morning, fresh energy
    hour >= 11 && hour < 13 -> "happy"   // late morning
    hour >= 13 && hour < 15 -> "angry"   // afternoon slump
    hour >= 15 && hour < 18 -> "calm"    // afternoon flow
    hour >= 18 && hour < 21 -> "calm"    // evening wind-down
    hour >= 21 && hour < 23 -> "neutral" // late evening
    else -> "sad"                        // 23–05 night
  }

  /**
   * Pick the next URI for [mood] from the payload, rotating through that mood's
   * bucket so a same-mood tick still changes the photo. Falls back to the flat
   * `all` list when the mood's own bucket is empty. Returns null on a bad payload.
   */
  private fun pickUriForMood(mood: String): String? {
    return try {
      val obj = JSONObject(payloadJson)
      var arr = obj.optJSONObject("moodUris")?.optJSONArray(mood)
      if (arr == null || arr.length() == 0) arr = obj.optJSONArray("all")
      if (arr == null || arr.length() == 0) return null
      val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val rot = prefs.getInt(KEY_ROTATION, 0)
      val idx = ((rot % arr.length()) + arr.length()) % arr.length()
      prefs.edit().putInt(KEY_ROTATION, rot + 1).apply()
      arr.optString(idx).ifEmpty { null }
    } catch (_: Throwable) {
      null
    }
  }

  /** Decode the local file and set it as both system + lock wallpaper. */
  private fun applyUri(uri: String) {
    val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
    if (path.isNullOrEmpty() || !File(path).exists()) return
    val bitmap = try {
      BitmapFactory.decodeFile(path)
    } catch (_: Throwable) {
      null
    } ?: return
    val fitted = fitBitmapToScreen(bitmap)
    try {
      WallpaperManager.getInstance(this).setBitmap(
        fitted,
        null,
        true,
        WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK,
      )
    } catch (_: Throwable) {
      // Decode/apply failure: skip this tick; scheduleNext() still re-arms.
    } finally {
      if (fitted !== bitmap) fitted.recycle()
      bitmap.recycle()
    }
  }

  /** Cover-scale + center-crop [src] to the real screen size so applied
   *  wallpapers aren't upscaled onto the oversized parallax canvas. Mirrors the
   *  Sleep/Wake service's fit logic. */
  private fun fitBitmapToScreen(src: Bitmap): Bitmap {
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val sw: Int
    val sh: Int
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val b = wm.currentWindowMetrics.bounds
      sw = b.width(); sh = b.height()
    } else {
      val dm = DisplayMetrics()
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getRealMetrics(dm)
      sw = dm.widthPixels; sh = dm.heightPixels
    }
    if (sw <= 0 || sh <= 0 || src.width <= 0 || src.height <= 0) return src
    val scale = maxOf(sw.toFloat() / src.width, sh.toFloat() / src.height)
    val scaledW = Math.round(src.width * scale)
    val scaledH = Math.round(src.height * scale)
    val scaled = Bitmap.createScaledBitmap(src, scaledW, scaledH, true)
    return try {
      val x = ((scaledW - sw) / 2).coerceIn(0, maxOf(0, scaledW - sw))
      val y = ((scaledH - sh) / 2).coerceIn(0, maxOf(0, scaledH - sh))
      val out = Bitmap.createBitmap(scaled, x, y, minOf(sw, scaledW), minOf(sh, scaledH))
      if (out !== scaled) scaled.recycle()
      out
    } catch (_: Throwable) {
      scaled
    }
  }

  // ─── Scheduling ───────────────────────────────────────────────────────────

  /** Schedule the next tick at `now + interval`, Doze-proof. */
  private fun scheduleNext() {
    val fireAt = System.currentTimeMillis() + intervalMinutes.toLong() * 60_000L
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = firePendingIntent(this)
    val canExact =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
    try {
      if (canExact) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
      }
    } catch (_: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Mood automation",
          NotificationManager.IMPORTANCE_MIN,
        ).apply {
          description = "Keeps mood-based wallpaper automation running"
          setSound(null, null)
          enableVibration(false)
          enableLights(false)
          setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
      }
    }
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_MIN)
    }
    return builder
      .setContentTitle("Mood automation active")
      .setContentText("Updating your wallpaper to match the moment")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .build()
  }

  companion object {
    @Volatile
    var isRunning = false

    // Set by ContextMoodAlarmReceiver when an alarm fires.
    const val EXTRA_FIRE = "fire"
    const val EXTRA_INTERVAL = "intervalMinutes"
    const val EXTRA_PAYLOAD = "payloadJson"
    const val ACTION_FIRE = "expo.modules.contextmoodforeground.FIRE"

    // Public so ContextMoodBootReceiver (same package) can read the persisted
    // config to decide whether to resume after a reboot.
    const val PREFS = "kawaii.contextmood.fg.prefs"
    const val KEY_INTERVAL = "intervalMinutes"
    const val KEY_PAYLOAD = "payloadJson"

    private const val CHANNEL_ID = "kawaii.contextmood.fg"
    private const val NOTIF_ID = 7421
    private const val REQ_FIRE = 7422
    private const val KEY_ROTATION = "rotationIndex"
    private const val DEFAULT_INTERVAL_MIN = 30

    /** The broadcast PendingIntent the alarm fires into. Shared by scheduleNext
     *  (arm) and tearDown (cancel) so both reference the identical intent. */
    fun firePendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, ContextMoodAlarmReceiver::class.java).apply {
        action = ACTION_FIRE
      }
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      return PendingIntent.getBroadcast(context, REQ_FIRE, intent, flags)
    }

    /** Cancel the alarm and wipe persisted config. Called ONLY on an explicit
     *  stop() — never from onDestroy (see the comment there). */
    fun tearDown(context: Context) {
      var flags = PendingIntent.FLAG_NO_CREATE
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      val intent = Intent(context, ContextMoodAlarmReceiver::class.java).apply { action = ACTION_FIRE }
      val pi = PendingIntent.getBroadcast(context, REQ_FIRE, intent, flags)
      if (pi != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        pi.cancel()
      }
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
  }
}
