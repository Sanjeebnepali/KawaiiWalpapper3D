package expo.modules.sleepwakeforeground

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.app.WallpaperManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.File
import java.util.Calendar

/**
 * Foreground service that swaps the wallpaper at two hours-of-day (wake /
 * sleep) while the app is closed. No JS context required after launch — it
 * decodes the local bitmaps itself and calls `WallpaperManager.setBitmap`.
 *
 * Timing model (changes/162): the NEXT of {wakeHour:00, sleepHour:00} is
 * scheduled with **`AlarmManager.setExactAndAllowWhileIdle`** (falls back to
 * `setAndAllowWhileIdle` when exact alarms aren't permitted). The previous
 * model used `Handler.postDelayed`, whose `uptimeMillis` clock PAUSES while the
 * CPU sleeps in Doze — so a multi-hour delay (the common case: arm at noon for
 * a 22:00 sleep) drifted by however long the phone was idle, firing late or at
 * a random wake-up. AlarmManager fires at the real wall-clock time even in
 * Doze, so 22:00 means 22:00.
 *
 * The alarm targets `SleepWakeAlarmReceiver`, which re-launches THIS service
 * with `EXTRA_FIRE_SLOT`; the service applies that slot's wallpaper and
 * re-arms the next one. So even if the OEM kills the service between fires, the
 * system-held alarm resurrects it at the exact time (provided the app is
 * battery-whitelisted — see lib/backgroundAccess). Config is mirrored to
 * SharedPreferences so a fire-restart (extras carry only the slot) recovers the
 * pair/hours; `stop()` cancels the alarm and wipes it.
 */
class SleepWakeForegroundService : Service() {

  companion object {
    @Volatile
    var isRunning = false

    const val EXTRA_WAKE_URI = "wakeUri"
    const val EXTRA_SLEEP_URI = "sleepUri"
    const val EXTRA_WAKE_HOUR = "wakeHour"
    const val EXTRA_SLEEP_HOUR = "sleepHour"
    // Set by SleepWakeAlarmReceiver when an alarm fires — tells onStartCommand
    // to apply this slot now (vs a normal start, which only arms).
    const val EXTRA_FIRE_SLOT = "fireSlot"

    const val ACTION_FIRE = "expo.modules.sleepwakeforeground.FIRE"

    private const val CHANNEL_ID = "kawaii.sleepwake.fg"
    private const val NOTIF_ID = 0x5715 // arbitrary, stable
    // Public so SleepWakeBootReceiver (same package) can read the persisted
    // config to decide whether to resume after a reboot.
    const val PREFS = "kawaii.sleepwake.prefs"
    // Single request code: arm() schedules exactly one next-fire at a time, so
    // one PendingIntent slot is enough. Extras (the slot) don't affect
    // PendingIntent identity (Intent.filterEquals ignores extras), so
    // FLAG_UPDATE_CURRENT refreshes the slot each re-arm.
    private const val REQ_FIRE = 0x5716

    // 0 = wake slot, 1 = sleep slot.
    private const val SLOT_WAKE = 0
    private const val SLOT_SLEEP = 1

    /** Cancel the next-fire alarm and wipe persisted config. Called ONLY on an
     *  explicit stop() from JS — never from onDestroy (see the comment there),
     *  so an OEM/low-memory kill can't accidentally disarm Sleep/Wake. */
    fun tearDown(context: Context) {
      var flags = PendingIntent.FLAG_NO_CREATE
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      val intent = Intent(context, SleepWakeAlarmReceiver::class.java).apply { action = ACTION_FIRE }
      val pi = PendingIntent.getBroadcast(context, REQ_FIRE, intent, flags)
      if (pi != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        pi.cancel()
      }
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
  }

  private var wakeUri: String = ""
  private var sleepUri: String = ""
  private var wakeHour: Int = 7
  private var sleepHour: Int = 22

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Wake / Sleep wallpaper",
        NotificationManager.IMPORTANCE_MIN,
      ).apply {
        description = "Keeps the time-of-day wallpaper swap running while the app is closed."
        setShowBadge(false)
      }
      nm.createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Prefer fresh config extras; fall back to persisted config on a sticky
    // restart OR an alarm-fire restart (which carries only EXTRA_FIRE_SLOT).
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (intent != null && intent.hasExtra(EXTRA_WAKE_URI)) {
      wakeUri = intent.getStringExtra(EXTRA_WAKE_URI) ?: ""
      sleepUri = intent.getStringExtra(EXTRA_SLEEP_URI) ?: ""
      wakeHour = clampHour(intent.getIntExtra(EXTRA_WAKE_HOUR, 7))
      sleepHour = clampHour(intent.getIntExtra(EXTRA_SLEEP_HOUR, 22))
      prefs.edit()
        .putString(EXTRA_WAKE_URI, wakeUri)
        .putString(EXTRA_SLEEP_URI, sleepUri)
        .putInt(EXTRA_WAKE_HOUR, wakeHour)
        .putInt(EXTRA_SLEEP_HOUR, sleepHour)
        .apply()
    } else {
      wakeUri = prefs.getString(EXTRA_WAKE_URI, "") ?: ""
      sleepUri = prefs.getString(EXTRA_SLEEP_URI, "") ?: ""
      wakeHour = clampHour(prefs.getInt(EXTRA_WAKE_HOUR, 7))
      sleepHour = clampHour(prefs.getInt(EXTRA_SLEEP_HOUR, 22))
    }

    startForegroundCompat()
    isRunning = true

    // If this start was triggered by a fired alarm, apply that slot now.
    val fireSlot = intent?.getIntExtra(EXTRA_FIRE_SLOT, -1) ?: -1
    if (fireSlot == SLOT_WAKE || fireSlot == SLOT_SLEEP) {
      applySlot(fireSlot)
    }

    // Always (re-)arm the next exact alarm.
    scheduleNext()
    return START_STICKY
  }

  override fun onDestroy() {
    // Intentionally does NOT cancel the alarm or clear config. A low-memory /
    // OEM kill can run onDestroy, and wiping here would stop the alarm +
    // START_STICKY + boot resurrection that lets Sleep/Wake fire while the app
    // is closed — the root of "Sleep/Wake only works if I open the app first."
    // Explicit stop wipes config via tearDown() from the JS module instead.
    isRunning = false
    super.onDestroy()
  }

  private fun clampHour(h: Int): Int = h.coerceIn(0, 23)

  /** Cover-scale + center-crop [src] to the real screen size so applied
   *  wallpapers aren't upscaled onto the oversized parallax canvas (zoom/crop). */
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
    } catch (e: Throwable) {
      scaled
    }
  }

  private fun startForegroundCompat() {
    val notif = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setContentTitle("Wake / Sleep wallpaper")
      .setContentText("Switching your wallpaper at the set times.")
      .setSmallIcon(android.R.drawable.ic_menu_gallery)
      .setOngoing(true)
      .build()
  }

  /** Broadcast PendingIntent to the alarm receiver, carrying the slot to fire. */
  private fun firePendingIntent(slot: Int): PendingIntent {
    val intent = Intent(this, SleepWakeAlarmReceiver::class.java).apply {
      action = ACTION_FIRE
      putExtra(EXTRA_FIRE_SLOT, slot)
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return PendingIntent.getBroadcast(this, REQ_FIRE, intent, flags)
  }

  /** Schedule the next {wake | sleep} fire at the exact wall-clock time. */
  private fun scheduleNext() {
    val now = System.currentTimeMillis()
    val nextWake = nextOccurrence(wakeHour, now)
    val nextSleep = nextOccurrence(sleepHour, now)
    // Whichever clock time arrives sooner wins this round.
    val slot = if (nextWake <= nextSleep) SLOT_WAKE else SLOT_SLEEP
    val fireAt = if (slot == SLOT_WAKE) nextWake else nextSleep

    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = firePendingIntent(slot)
    // Exact-while-idle fires precisely even in Doze. On Android 12+ exact alarms
    // can be denied; fall back to setAndAllowWhileIdle (still Doze-capable, but
    // delivered within a maintenance window ≈ a few minutes late).
    val canExact =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
    try {
      if (canExact) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
      }
    } catch (_: SecurityException) {
      // Some OEMs throw even when canScheduleExactAlarms() reported true.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
    }
  }

  /**
   * Next epoch-ms at which the wall clock reads `hour:00:00` — today if that
   * time is still in the future, otherwise tomorrow.
   */
  private fun nextOccurrence(hour: Int, now: Long): Long {
    val cal = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    if (cal.timeInMillis <= now) {
      cal.add(Calendar.DAY_OF_YEAR, 1)
    }
    return cal.timeInMillis
  }

  /** Decode + apply the wallpaper for the given slot. Failures skip silently. */
  private fun applySlot(slot: Int) {
    val uri = if (slot == SLOT_WAKE) wakeUri else sleepUri
    if (uri.isEmpty()) return

    val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
    if (path.isNullOrEmpty() || !File(path).exists()) return

    val bitmap = try {
      BitmapFactory.decodeFile(path)
    } catch (_: Throwable) {
      null
    } ?: return

    val fitted = fitBitmapToScreen(bitmap)
    try {
      val manager = WallpaperManager.getInstance(this)
      manager.setBitmap(
        fitted,
        null,
        true,
        WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK,
      )
    } catch (_: Throwable) {
      // Decode/apply failure: skip this fire; scheduleNext() still re-arms.
    } finally {
      if (fitted !== bitmap) fitted.recycle()
      bitmap.recycle()
    }
  }
}
