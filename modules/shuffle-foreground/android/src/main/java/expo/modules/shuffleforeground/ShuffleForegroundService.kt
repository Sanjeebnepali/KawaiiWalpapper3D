package expo.modules.shuffleforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.WallpaperManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import java.util.Calendar
import kotlin.random.Random

/**
 * The ongoing foreground service. Arms a Handler.postDelayed loop that fires
 * every intervalMs and applies the next wallpaper NATIVELY via
 * WallpaperManager.setBitmap (same approach as wallpaper-setter), advancing
 * the index per `mode`. START_STICKY + SharedPreferences-persisted state makes
 * it survive process death / cold restart by the OS.
 */
class ShuffleForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())

  private var uris: List<String> = emptyList()
  private var intervalMs = DEFAULT_INTERVAL_MS
  private var mode = "sequential"
  private var currentIndex = 0
  private var tickRunnable: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    // Resolve config: explicit intent extras win; otherwise fall back to the
    // persisted values (for an OS-driven START_STICKY restart where intent is
    // null or empty).
    val extraUris = intent?.getStringArrayListExtra("uris")
    // A "fresh start" is one JS kicked off with config extras (the user just
    // started/changed a shuffle) — as opposed to a null-intent START_STICKY
    // restart by the OS. Only a fresh start applies the first image
    // immediately (below), so an OS restart doesn't re-flash the wallpaper.
    val isFreshStart = !extraUris.isNullOrEmpty()
    uris = if (!extraUris.isNullOrEmpty()) {
      extraUris.toList()
    } else {
      prefs.getString(KEY_URIS, null)?.split("\n")?.filter { it.isNotEmpty() } ?: emptyList()
    }

    val extraInterval = intent?.getLongExtra("intervalMs", -1L) ?: -1L
    intervalMs = (if (extraInterval > 0) extraInterval else prefs.getLong(KEY_INTERVAL, DEFAULT_INTERVAL_MS))
      .coerceAtLeast(MIN_INTERVAL_MS)

    mode = intent?.getStringExtra("mode") ?: prefs.getString(KEY_MODE, "sequential") ?: "sequential"

    val extraStart = intent?.getIntExtra("startIndex", -1) ?: -1
    currentIndex = if (extraStart >= 0) extraStart else prefs.getInt(KEY_START_INDEX, 0)
    if (uris.isNotEmpty()) {
      currentIndex = ((currentIndex % uris.size) + uris.size) % uris.size
    } else {
      currentIndex = 0
    }

    // Persist for a START_STICKY restart.
    prefs.edit()
      .putString(KEY_URIS, uris.joinToString("\n"))
      .putLong(KEY_INTERVAL, intervalMs)
      .putString(KEY_MODE, mode)
      .putInt(KEY_START_INDEX, currentIndex)
      .apply()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, buildNotification())
    }

    isRunning = true
    armTick(isFreshStart)
    return START_STICKY
  }

  override fun onDestroy() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
    handler.removeCallbacksAndMessages(null)
    isRunning = false
    super.onDestroy()
  }

  /**
   * Re-arm a self-reposting runnable that rotates the wallpaper every interval.
   *
   * When [applyNow] is true (a fresh JS-initiated start) we apply the START
   * index IMMEDIATELY before scheduling the loop, so the very first change is
   * instant. Previously the first `rotate()` was a full interval out, so a user
   * who started a shuffle saw nothing change for 15–30 min unless the JS-side
   * instant-apply happened to win — the "delay before first change" bug
   * (changes/164). The images are already precached to local files before
   * start(), so this immediate apply is a fast on-disk decode, not a download.
   */
  private fun armTick(applyNow: Boolean) {
    tickRunnable?.let { handler.removeCallbacks(it) }
    if (uris.isEmpty()) return
    if (applyNow) applyWallpaper(currentIndex)
    val runnable = object : Runnable {
      override fun run() {
        rotate()
        handler.postDelayed(this, intervalMs)
      }
    }
    tickRunnable = runnable
    handler.postDelayed(runnable, intervalMs)
  }

  /** Compute the next index per mode, apply the wallpaper, persist, advance. */
  private fun rotate() {
    val n = uris.size
    if (n == 0) return

    val nextIndex = when (mode) {
      "random" -> {
        if (n == 1) 0
        else {
          var r = Random.nextInt(n)
          while (r == currentIndex) r = Random.nextInt(n)
          r
        }
      }
      "smart" -> {
        // Split the list in half: daytime (06:00..17:59) draws from the first
        // half, evening/night from the second half. Within the chosen half we
        // advance sequentially so the picture still changes each tick.
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val isDay = hour in 6..17
        val half = (n + 1) / 2
        if (isDay) {
          val base = 0
          val span = half
          base + ((currentIndex - base + 1) % span + span) % span
        } else {
          val base = half
          val span = n - half
          if (span <= 0) (currentIndex + 1) % n
          else base + ((currentIndex - base + 1) % span + span) % span
        }
      }
      // "sequential" and "day" both step linearly through the list.
      else -> (currentIndex + 1) % n
    }

    applyWallpaper(nextIndex)
    currentIndex = nextIndex
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putInt(KEY_START_INDEX, currentIndex)
      .apply()
  }

  /** Decode the URI at [index] and set it as both home + lock wallpaper. */
  private fun applyWallpaper(index: Int) {
    val uri = uris.getOrNull(index) ?: return
    // Accept both `file://…` URIs and bare filesystem paths.
    val path = if (uri.startsWith("file://")) Uri.parse(uri).path else uri
    if (path.isNullOrEmpty()) return

    val bitmap = try {
      BitmapFactory.decodeFile(path)
    } catch (e: Throwable) {
      null
    } ?: return // skip bad/undecodable URIs gracefully

    val fitted = fitBitmapToScreen(bitmap)
    try {
      val manager = WallpaperManager.getInstance(this)
      // FLAG_SYSTEM = home, FLAG_LOCK = lock (both API 24+; minSdk is 24).
      manager.setBitmap(
        fitted,
        null,
        true,
        WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK,
      )
      getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        .putInt(KEY_LAST_INDEX, index)
        .putLong(KEY_LAST_AT, System.currentTimeMillis())
        .putString(KEY_LAST_URI, uri)
        .apply()
    } catch (e: Throwable) {
      // Swallow — a failed apply must not crash the service or stop the timer.
    } finally {
      if (fitted !== bitmap) fitted.recycle()
      bitmap.recycle()
    }
  }

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

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Wallpaper shuffle",
          NotificationManager.IMPORTANCE_MIN,
        ).apply {
          description = "Keeps the wallpaper shuffle running while the app is closed"
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
      .setContentTitle("Wallpaper shuffle active")
      .setContentText("Rotating your wallpapers in the background")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .build()
  }

  companion object {
    @Volatile
    var isRunning = false

    const val PREFS = "kawaii.shuffle.fg.prefs"
    const val KEY_LAST_INDEX = "last_index"
    const val KEY_LAST_AT = "last_at"
    const val KEY_LAST_URI = "last_uri"

    private const val CHANNEL_ID = "kawaii.shuffle.fg"
    private const val NOTIF_ID = 7422
    private const val KEY_URIS = "uris"
    private const val KEY_INTERVAL = "intervalMs"
    private const val KEY_MODE = "mode"
    private const val KEY_START_INDEX = "start_index"
    private const val DEFAULT_INTERVAL_MS = 30 * 60_000L
    private const val MIN_INTERVAL_MS = 60_000L
  }
}
