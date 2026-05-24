package expo.modules.contextmoodforeground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * The ongoing foreground service. Arms a Handler.postDelayed loop that fires
 * every intervalMinutes and asks the live module instance to emit `onTick`
 * back to JS. START_STICKY + a SharedPreferences-persisted interval makes it
 * survive process death / cold restart by the OS.
 */
class ContextMoodForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var intervalMinutes = DEFAULT_INTERVAL_MIN
  private var tickRunnable: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Resolve interval: explicit extra wins, else the persisted value (for an
    // OS-driven START_STICKY restart where intent is null), else the default.
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val fromExtra = intent?.getIntExtra("intervalMinutes", -1) ?: -1
    intervalMinutes = (if (fromExtra > 0) fromExtra else prefs.getInt(KEY_INTERVAL, DEFAULT_INTERVAL_MIN))
      .coerceIn(5, 1440)
    prefs.edit().putInt(KEY_INTERVAL, intervalMinutes).apply()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, buildNotification())
    }

    isRunning = true
    armTick()
    return START_STICKY
  }

  override fun onDestroy() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
    handler.removeCallbacksAndMessages(null)
    isRunning = false
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    super.onDestroy()
  }

  /** Re-arm a self-reposting runnable that emits a tick every interval. */
  private fun armTick() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    val delayMs = intervalMinutes.toLong() * 60_000L
    val runnable = object : Runnable {
      override fun run() {
        ContextMoodForegroundModule.instance?.emitTick()
        handler.postDelayed(this, delayMs)
      }
    }
    tickRunnable = runnable
    handler.postDelayed(runnable, delayMs)
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

    private const val CHANNEL_ID = "kawaii.contextmood.fg"
    private const val NOTIF_ID = 7421
    private const val PREFS = "kawaii.contextmood.fg.prefs"
    private const val KEY_INTERVAL = "intervalMinutes"
    private const val DEFAULT_INTERVAL_MIN = 30
  }
}
