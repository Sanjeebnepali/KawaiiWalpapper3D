package expo.modules.sleepwakeforeground

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.app.WallpaperManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.File
import java.util.Calendar

/**
 * Foreground service that swaps the wallpaper at two hours-of-day (wake /
 * sleep) while the app is closed. No JS context required after launch — it
 * decodes the local bitmaps itself and calls `WallpaperManager.setBitmap`.
 *
 * Tick model: instead of a fixed interval, on each arm we compute the ms
 * until the NEXT of {wakeHour:00, sleepHour:00} (today or tomorrow,
 * whichever clock time comes sooner) and `Handler.postDelayed` to it. On
 * fire we apply that slot's wallpaper, then re-compute + re-arm. Config is
 * mirrored to SharedPreferences so a START_STICKY cold restart (extras
 * dropped by the OS) resumes the same pair/hours; `stop()` wipes it.
 */
class SleepWakeForegroundService : Service() {

  companion object {
    @Volatile
    var isRunning = false

    const val EXTRA_WAKE_URI = "wakeUri"
    const val EXTRA_SLEEP_URI = "sleepUri"
    const val EXTRA_WAKE_HOUR = "wakeHour"
    const val EXTRA_SLEEP_HOUR = "sleepHour"

    private const val CHANNEL_ID = "kawaii.sleepwake.fg"
    private const val NOTIF_ID = 0x5715 // arbitrary, stable
    private const val PREFS = "kawaii.sleepwake.prefs"

    // 0 = wake slot, 1 = sleep slot.
    private const val SLOT_WAKE = 0
    private const val SLOT_SLEEP = 1
  }

  private val handler = Handler(Looper.getMainLooper())
  private var tick: Runnable? = null

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
    // Prefer fresh extras; fall back to persisted config on a sticky restart.
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

    arm()
    return START_STICKY
  }

  override fun onDestroy() {
    tick?.let { handler.removeCallbacks(it) }
    tick = null
    isRunning = false
    // Clear cache so a later cold START_STICKY restart doesn't resume the
    // old config without an explicit start() from JS.
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
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

  /** Compute ms until the next fire, post the runnable. */
  private fun arm() {
    tick?.let { handler.removeCallbacks(it) }

    val now = System.currentTimeMillis()
    val nextWake = nextOccurrence(wakeHour, now)
    val nextSleep = nextOccurrence(sleepHour, now)

    // Whichever clock time arrives sooner wins this round.
    val slot = if (nextWake <= nextSleep) SLOT_WAKE else SLOT_SLEEP
    val fireAt = if (slot == SLOT_WAKE) nextWake else nextSleep
    val delay = (fireAt - now).coerceAtLeast(0L)

    val runnable = Runnable {
      applySlot(slot)
      // Re-compute against the new "now" and re-arm for the following slot.
      arm()
    }
    tick = runnable
    handler.postDelayed(runnable, delay)
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
      // Decode/apply failure: skip this fire; arm() already re-schedules.
    } finally {
      if (fitted !== bitmap) fitted.recycle()
      bitmap.recycle()
    }
  }
}
