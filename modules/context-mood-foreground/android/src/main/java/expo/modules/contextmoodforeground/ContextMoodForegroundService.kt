package expo.modules.contextmoodforeground

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * The ongoing foreground service. Fires a tick every `intervalMinutes` and asks
 * the live module instance to emit `onTick` back to JS. START_STICKY + a
 * SharedPreferences-persisted interval makes it survive process death / cold
 * restart by the OS.
 *
 * Timing model (changes/168): the next tick is scheduled with
 * **`AlarmManager.setExactAndAllowWhileIdle`** (falls back to
 * `setAndAllowWhileIdle`), NOT `Handler.postDelayed`. `postDelayed` runs off
 * `uptimeMillis`, whose clock PAUSES while the CPU sleeps in Doze (screen off) —
 * so context-mood inference stalled with the screen off and only caught up when
 * the user woke the phone ("feels delayed / off when the phone is off").
 * AlarmManager fires at the real wall-clock time even in Doze.
 *
 * The alarm targets `ContextMoodAlarmReceiver`, which re-launches THIS service
 * with `EXTRA_FIRE`; the service emits the tick and re-arms. So an OEM-killed
 * service is resurrected by the system-held alarm (provided the app is
 * battery-whitelisted — see lib/backgroundAccess).
 */
class ContextMoodForegroundService : Service() {
  private var intervalMinutes = DEFAULT_INTERVAL_MIN

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Resolve interval: explicit extra wins, else the persisted value (for an
    // OS-driven START_STICKY restart or an alarm-fire restart, where the intent
    // carries only EXTRA_FIRE), else the default.
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

    // If this start came from a fired alarm, emit the tick now. (A fresh start
    // only arms — the first tick lands one interval out.)
    if (intent?.getBooleanExtra(EXTRA_FIRE, false) == true) {
      ContextMoodForegroundModule.instance?.emitTick()
    }

    scheduleNext()
    return START_STICKY
  }

  override fun onDestroy() {
    cancelAlarm()
    isRunning = false
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    super.onDestroy()
  }

  /** Schedule the next tick at `now + interval`, Doze-proof. */
  private fun scheduleNext() {
    val fireAt = System.currentTimeMillis() + intervalMinutes.toLong() * 60_000L
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = firePendingIntent()
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

  private fun firePendingIntent(): PendingIntent {
    val intent = Intent(this, ContextMoodAlarmReceiver::class.java).apply {
      action = ACTION_FIRE
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return PendingIntent.getBroadcast(this, REQ_FIRE, intent, flags)
  }

  private fun cancelAlarm() {
    var flags = PendingIntent.FLAG_NO_CREATE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    val intent = Intent(this, ContextMoodAlarmReceiver::class.java).apply { action = ACTION_FIRE }
    val pi = PendingIntent.getBroadcast(this, REQ_FIRE, intent, flags)
    if (pi != null) {
      (getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
      pi.cancel()
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
    const val ACTION_FIRE = "expo.modules.contextmoodforeground.FIRE"

    private const val CHANNEL_ID = "kawaii.contextmood.fg"
    private const val NOTIF_ID = 7421
    private const val REQ_FIRE = 7422
    private const val PREFS = "kawaii.contextmood.fg.prefs"
    private const val KEY_INTERVAL = "intervalMinutes"
    private const val DEFAULT_INTERVAL_MIN = 30
  }
}
