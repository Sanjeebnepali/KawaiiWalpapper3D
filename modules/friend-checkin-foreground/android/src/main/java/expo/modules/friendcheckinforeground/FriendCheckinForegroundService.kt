package expo.modules.friendcheckinforeground

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
import androidx.core.app.NotificationCompat

/**
 * Periodic-tick foreground service for the Mood friend check-in. Stays alive
 * with an ongoing low-priority notification (Android 8+ mandatory) and arms a
 * `Handler.postDelayed` loop that calls back into the JS bridge on each tick.
 *
 * Cold-restart resilient: the interval is persisted to SharedPreferences and
 * the service is START_STICKY, so if Android kills + restarts it with a null
 * intent we resume the schedule from prefs.
 */
class FriendCheckinForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var intervalMs: Long = DEFAULT_INTERVAL_MINUTES * 60_000L
  private var tickRunnable: Runnable? = null

  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Friend check-in",
        // IMPORTANCE_MIN — no sound, collapsed in the shade. The notification
        // is only present to satisfy the FGS requirement, not to alert.
        NotificationManager.IMPORTANCE_MIN,
      ).apply {
        description = "Keeps friend check-in reminders running."
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // A null intent means Android restarted us (START_STICKY) — fall back to
    // the persisted interval. A fresh start carries the requested interval.
    val requested = intent?.getIntExtra("intervalMinutes", -1) ?: -1
    val minutes = if (requested > 0) {
      requested.coerceIn(5, 1440)
    } else {
      prefs.getInt(KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES).coerceIn(5, 1440)
    }
    prefs.edit().putInt(KEY_INTERVAL_MINUTES, minutes).apply()
    intervalMs = minutes * 60_000L

    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notification)
    }

    isRunning = true
    armTick()
    return START_STICKY
  }

  private fun armTick() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    val runnable = object : Runnable {
      override fun run() {
        FriendCheckinForegroundModule.instance?.emitTick()
        // Re-post for the next interval. Reading intervalMs fresh each time
        // lets a restart with a new interval take effect on the next tick.
        handler.postDelayed(this, intervalMs)
      }
    }
    tickRunnable = runnable
    handler.postDelayed(runnable, intervalMs)
  }

  private fun buildNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Check-in reminders active")
      .setContentText("Keeping your mood check-ins on schedule.")
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setShowWhen(false)
      .build()
  }

  override fun onDestroy() {
    tickRunnable?.let { handler.removeCallbacks(it) }
    tickRunnable = null
    isRunning = false
    // Clear the persisted schedule so a stray START_STICKY restart doesn't
    // silently revive a service the user (via JS) asked to stop.
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
      .remove(KEY_INTERVAL_MINUTES)
      .apply()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    @Volatile
    var isRunning = false

    private const val CHANNEL_ID = "kawaii.friendcheckin.fg"
    private const val NOTIF_ID = 0xF21D // arbitrary, stable per-service id
    private const val PREFS_NAME = "friend_checkin_foreground"
    private const val KEY_INTERVAL_MINUTES = "intervalMinutes"
    private const val DEFAULT_INTERVAL_MINUTES = 60
  }
}
