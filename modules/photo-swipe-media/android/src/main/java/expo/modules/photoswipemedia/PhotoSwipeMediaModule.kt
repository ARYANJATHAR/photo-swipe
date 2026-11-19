package expo.modules.photoswipemedia

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PhotoSwipeMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PhotoSwipeMedia")

    AsyncFunction("getStatus") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
      val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaStore.canManageMedia(context) else false
      mapOf(
        "supported" to supported,
        "granted" to granted
      )
    }

    AsyncFunction("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@AsyncFunction null
      }
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val intent = Intent(Settings.ACTION_REQUEST_MANAGE_MEDIA, Uri.parse("package:${activity.packageName}"))
      activity.startActivity(intent)
      null
    }.runOnQueue(Queues.MAIN)
  }
}
