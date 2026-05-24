package expo.modules.wallpapersetter

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Applies a local image as the wallpaper in ONE tap via
 * `WallpaperManager.setBitmap`, bypassing the system "Set as Wallpaper"
 * picker / ACTION_ATTACH_DATA chooser (which on many OEM skins routes to
 * "Set contact photo"). Android-only.
 *
 * JS contract (see ../../index.ts):
 *   setWallpaper(localUri: string, target: 'home'|'lock'|'both'): Promise<boolean>
 */
class WallpaperSetterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WallpaperSetter")

    AsyncFunction("setWallpaper") { localUri: String, target: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

      val path = if (localUri.startsWith("file://")) Uri.parse(localUri).path else localUri
      if (path.isNullOrEmpty() || !File(path).exists()) {
        throw Exception("Wallpaper image not found: $localUri")
      }

      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw Exception("Could not decode image: $localUri")

      val manager = WallpaperManager.getInstance(context)
      val which = when (target) {
        "home" -> WallpaperManager.FLAG_SYSTEM
        "lock" -> WallpaperManager.FLAG_LOCK
        else -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
      }
      // Fit the image to the real screen size (cover) BEFORE applying, so the
      // system doesn't upscale it onto its oversized parallax canvas — which
      // made applied wallpapers look zoomed-in / cropped.
      val fitted = fitBitmapToScreen(context, bitmap)
      try {
        manager.setBitmap(fitted, null, true, which)
      } finally {
        if (fitted !== bitmap) fitted.recycle()
        bitmap.recycle()
      }
      true
    }
  }
}

/**
 * Cover-scale + center-crop [src] to the device's real screen resolution.
 * Returns [src] unchanged if the screen size can't be determined.
 */
private fun fitBitmapToScreen(context: Context, src: Bitmap): Bitmap {
  val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
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
