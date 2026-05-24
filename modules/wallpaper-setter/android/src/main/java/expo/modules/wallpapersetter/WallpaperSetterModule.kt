package expo.modules.wallpapersetter

import android.app.WallpaperManager
import android.graphics.BitmapFactory
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Applies a local image as the wallpaper in ONE tap via
 * `WallpaperManager.setBitmap`, bypassing the system "Set as Wallpaper"
 * picker / ACTION_ATTACH_DATA chooser (which on many OEM skins routes to
 * "Set contact photo" — the bug the JS fallback hit). Android-only.
 *
 * JS contract (see ../../index.ts):
 *   setWallpaper(localUri: string, target: 'home'|'lock'|'both'): Promise<boolean>
 */
class WallpaperSetterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WallpaperSetter")

    AsyncFunction("setWallpaper") { localUri: String, target: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

      // Accept both `file://…` URIs (the common case from cacheDirectory)
      // and bare filesystem paths.
      val path = if (localUri.startsWith("file://")) Uri.parse(localUri).path else localUri
      if (path.isNullOrEmpty() || !File(path).exists()) {
        throw Exception("Wallpaper image not found: $localUri")
      }

      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw Exception("Could not decode image: $localUri")

      val manager = WallpaperManager.getInstance(context)
      // FLAG_SYSTEM = home screen, FLAG_LOCK = lock screen (both API 24+,
      // and minSdk is 24, so the 4-arg setBitmap(which) is always available).
      val which = when (target) {
        "home" -> WallpaperManager.FLAG_SYSTEM
        "lock" -> WallpaperManager.FLAG_LOCK
        else -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
      }
      try {
        manager.setBitmap(bitmap, null, true, which)
      } finally {
        bitmap.recycle()
      }
      true
    }
  }
}
