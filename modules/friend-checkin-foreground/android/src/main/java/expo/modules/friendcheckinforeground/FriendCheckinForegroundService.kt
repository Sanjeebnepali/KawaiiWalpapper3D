package expo.modules.friendcheckinforeground

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
import androidx.core.app.NotificationCompat

/**
 * Periodic-tick foreground service for the Mood friend check-in. Stays alive
 * with an ongoing low-priority notification (Android 8+ mandatory) and fires a
 * tick every `intervalMinutes` that calls back into the JS bridge.
 *
 * Timing model (changes/168): the next tick is scheduled with
 * **`AlarmManager.setExactAndAllowWhileIdle`** (falls back to
 * `setAndAllowWhileIdle` when exact alarms aren't permitted), NOT
 * `Handler.postDelayed`. `postDelayed` runs off `uptimeMillis`, whose clock
 * PAUSES while the CPU sleeps in Doze (screen off) — so with the screen off the
 * tick stalled until the user woke the phone, and the prompts arrived late / in
 * a burst ("feels delayed / turns off when the phone is off"). AlarmManager
 * fires at the real wall-clock time even in Doze, so the cadence holds.
 *
 * The alarm targets `FriendCheckinAlarmReceiver`, which re-launches THIS service
 * with `EXTRA_FIRE`; the service emits the tick and re-arms the next alarm. So
 * even if the OEM kills the service between fires, the system-held alarm
 * resurrects it at the right time (provided the app is battery-whitelisted —
 * see lib/backgroundAccess). The interval is mirrored to SharedPreferences so a
 * fire-restart (extras carry only the marker) recovers it; `stop()` cancels the
 * alarm and wipes it.
 *
 * Cold-restart resilient: START_STICKY + the persisted interval mean an
 * OS-driven restart with a null intent resumes the schedule.
 */
class FriendCheckinForegroundService : Service() {
  private var intervalMs: Long = DEFAULT_INTERVAL_MINUTES * 60_000L

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

      // Separate HIGH-importance channel for the actual check-in PROMPT we post
      // natively when the JS runtime is dead (see postPromptNotification). The
      // ongoing FGS notification above must stay silent/MIN, but the prompt is a
      // real "hey, how are you feeling?" alert the user should see.
      val promptChannel = NotificationChannel(
        PROMPT_CHANNEL_ID,
        "Mood check-in",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "The periodic \"how are you feeling?\" prompt."
        setShowBadge(true)
      }
      manager.createNotificationChannel(promptChannel)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // A null intent means Android restarted us (START_STICKY); an alarm-fire
    // restart carries only EXTRA_FIRE. Both fall back to the persisted
    // interval. A fresh start from JS carries the requested interval.
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

    // If this start came from a fired alarm, deliver the check-in now. (A fresh
    // start only arms — the first tick lands one interval out, as before.)
    //
    // The fix for "check-in never arrives": which path delivers depends on
    // whether the JS runtime is alive.
    //   - JS alive  → emitTick(), so JS posts the RICH prompt (7 mood action
    //     buttons + offline apply via the expo-notifications response handler),
    //     exactly as before. This is the in-app / recently-backgrounded case.
    //   - JS dead   → the alarm cold-started this service with NO JS runtime
    //     (the normal state once the app's been closed a while, and the default
    //     on Vivo/MIUI/ColorOS). `instance` is null, so emitTick() would vanish
    //     into the void — the actual bug. Post the prompt NATIVELY instead so it
    //     reliably appears; tapping it opens the app to pick a mood. (changes/187)
    if (intent?.getBooleanExtra(EXTRA_FIRE, false) == true) {
      val liveModule = FriendCheckinForegroundModule.instance
      if (liveModule != null) {
        liveModule.emitTick()
      } else {
        postPromptNotification()
      }
    }

    // Always (re-)arm the next exact alarm.
    scheduleNext()
    return START_STICKY
  }

  /** Schedule the next tick at `now + intervalMs`, Doze-proof. */
  private fun scheduleNext() {
    val fireAt = System.currentTimeMillis() + intervalMs
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
      // Some OEMs throw even when canScheduleExactAlarms() reported true.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
    }
  }

  private fun firePendingIntent(): PendingIntent {
    val intent = Intent(this, FriendCheckinAlarmReceiver::class.java).apply {
      action = ACTION_FIRE
    }
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return PendingIntent.getBroadcast(this, REQ_FIRE, intent, flags)
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

  /**
   * Post the "how are you feeling?" prompt natively. Called ONLY when the JS
   * runtime is dead (see onStartCommand) — otherwise JS posts the richer
   * action-button version. Tapping this opens the app so the user can pick a
   * mood; that's one tap more than the in-app action buttons, but it's the
   * difference between the prompt appearing and silently never firing.
   */
  private fun postPromptNotification() {
    val (title, body) = PROMPT_OPENERS[nextOpenerIndex()]

    // Content tap → relaunch the app's main activity. getLaunchIntentForPackage
    // may return null on some OEM shells; degrade to a body-only notification.
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    var piFlags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      piFlags = piFlags or PendingIntent.FLAG_IMMUTABLE
    }
    val contentPi =
      if (launch != null) PendingIntent.getActivity(this, REQ_PROMPT, launch, piFlags) else null

    val builder = NotificationCompat.Builder(this, PROMPT_CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
    if (contentPi != null) builder.setContentIntent(contentPi)

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(PROMPT_NOTIF_ID, builder.build())
  }

  /** Rotate through the openers so consecutive prompts vary. Persisted so the
   *  variety survives the cold-start-per-fire lifecycle. */
  private fun nextOpenerIndex(): Int {
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val i = prefs.getInt(KEY_OPENER_INDEX, 0)
    prefs.edit().putInt(KEY_OPENER_INDEX, i + 1).apply()
    return ((i % PROMPT_OPENERS.size) + PROMPT_OPENERS.size) % PROMPT_OPENERS.size
  }

  override fun onDestroy() {
    // Intentionally does NOT cancel the alarm or clear the persisted interval. A
    // low-memory / OEM kill can run onDestroy, and wiping here would stop the
    // alarm + START_STICKY + boot resurrection that lets the check-in tick fire
    // while the app is closed — the root of "check-ins stop and never come back
    // after the phone kills the app." Explicit stop() wipes config via
    // tearDown() from the JS module instead.
    isRunning = false
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    @Volatile
    var isRunning = false

    // Set by FriendCheckinAlarmReceiver when an alarm fires — tells
    // onStartCommand to emit a tick now (vs a fresh start, which only arms).
    const val EXTRA_FIRE = "fire"
    const val ACTION_FIRE = "expo.modules.friendcheckinforeground.FIRE"

    private const val CHANNEL_ID = "kawaii.friendcheckin.fg"
    private const val NOTIF_ID = 0xF21D // arbitrary, stable per-service id
    // arm() schedules exactly one next-fire at a time, so one slot is enough.
    private const val REQ_FIRE = 0xF21E

    // HIGH-importance channel + id for the natively-posted prompt (JS-dead path).
    private const val PROMPT_CHANNEL_ID = "kawaii.friendcheckin.prompt"
    private const val PROMPT_NOTIF_ID = 0xF21F
    private const val REQ_PROMPT = 0xF220
    private const val KEY_OPENER_INDEX = "openerIndex"

    // Title/body pairs for the native prompt. Literal emoji match the rest of
    // the codebase (lib/moodNotifications.ts uses the same); the file is UTF-8.
    private val PROMPT_OPENERS = arrayOf(
      "Hey 👋 how are you feeling?" to "Tap to pick a mood and refresh your wallpaper.",
      "Quick mood check 😊" to "Tap to choose how you feel right now.",
      "Thinking of you 💜" to "Tap to set a wallpaper that matches your mood.",
    )
    // Public so FriendCheckinBootReceiver (same package) can read the persisted
    // interval to decide whether to resume after a reboot.
    const val PREFS_NAME = "friend_checkin_foreground"
    const val KEY_INTERVAL_MINUTES = "intervalMinutes"
    private const val DEFAULT_INTERVAL_MINUTES = 60

    /** Cancel the next-fire alarm and wipe persisted config. Called ONLY on an
     *  explicit stop() from JS — never from onDestroy (see the comment there),
     *  so an OEM/low-memory kill can't accidentally disarm friend check-in. */
    fun tearDown(context: Context) {
      var flags = PendingIntent.FLAG_NO_CREATE
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      val intent = Intent(context, FriendCheckinAlarmReceiver::class.java).apply { action = ACTION_FIRE }
      val pi = PendingIntent.getBroadcast(context, REQ_FIRE, intent, flags)
      if (pi != null) {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        pi.cancel()
      }
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
    }
  }
}
