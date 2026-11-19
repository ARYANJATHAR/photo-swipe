# Flick — Android app plan

Status: first Android implementation. This project is independent of the Pocket wallet in `../pocket/`.

## Goal and user experience

Create an Android photo-cleaning app showing accessible device photos newest first. Swipe left to keep; swipe right to request deletion immediately.

- Clean, light interface with one large photo card, a subtle next-card preview, and labeled Keep/Delete buttons.
- Display the complete photo without cropping, its date, and session counts.
- Animate horizontal swipes with KEEP/DELETE feedback. Incomplete swipes return to their starting position.
- Keep records the decision and advances. Delete requests removal immediately, with no batch-review screen.
- Allow Android's required system deletion confirmation. Advance and increment deletion counts only after success. Cancellation or failure leaves the current photo available and displays appropriate feedback.
- Disable actions while a deletion request is pending. Do not automatically retry deletion after cancellation or restart.
- Explain immediate deletion during onboarding. Do not promise restoration or expose a misleading deletion undo.
- Include permission explanation, loading, empty-library, unavailable-photo, and completion states.

## Implementation approach

- Create an independent Expo SDK 57/TypeScript project here with npm, its own lockfile, and Expo Router routes in `src/app/`. Keep components, hooks, services, and domain logic outside route files.
- Recheck the installed Expo version and matching versioned documentation before implementing APIs. Install compatible dependencies using `npx expo install`.
- Use `expo-media-library` for photo queries/deletion, `expo-image` for display, Gesture Handler/Reanimated for swiping, and SQLite for local progress.
- Use SDK 57's current `Query` and `Asset` interfaces, including `asset.delete()`, rather than deprecated methods that throw at runtime.
- Request photo permissions only. Clearly identify limited access and support permission management when access is denied.
- Page photo metadata, render only nearby cards, and prefetch a small number of photos. Refresh pagination after deletion/library changes so shifted results cannot skip photos.
- Persist kept asset IDs locally and resume remaining accessible photos on restart. Kept photos stay excluded across album changes.
- Keep photos on-device and persist only progress metadata. No accounts or backend.
- Use separate Android identifiers/build configuration. Configure native behavior through Expo configuration; do not manually create generated native projects.

## Validation and acceptance

- Test swipe thresholds, keep persistence, repeated-action prevention, and deletion success/cancellation/failure transitions.
- Verify pagination after deletion, new photos, permission changes, unavailable files, and restarts.
- Check a physical Android development build with disposable photos, limited access, a large library, different orientations, and reduced-motion settings.
- Run Expo lint, TypeScript checking, and Expo Doctor from this folder before declaring implementation complete.

## Defaults and deferred features

Working name: Photo Swipe. First delivery: Android development build for personal testing. Photos only. Defer iOS delivery, videos, month filters, duplicate detection, cloud integration, and store publication. No batch-review screen or in-app restoration of deleted photos.

## References

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Expo media library](https://docs.expo.dev/versions/v57.0.0/sdk/media-library/)
- [Expo documentation index](https://docs.expo.dev/llms.txt)
- [Android media access and deletion](https://developer.android.com/training/data-storage/shared/media#remove-item)

## Development and APK builds

The latest APK is `artifacts/flick-v1.3.0.apk`. Older APKs, obsolete Expo QR files, and temporary exports were removed after verification. Earlier version paths below describe historical builds.

Run commands from this folder:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npx.cmd expo-doctor
npx.cmd expo start
```

The requested APK is built locally; no app source is uploaded to EAS. Set the local Android SDK and JDK paths, then run:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "C:\Android\sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
```

The script generates Android through Expo, builds a standalone APK with bundled JavaScript, and copies it to `artifacts/flick-v<app version>.apk`. The default targets arm64-v8a phones. Expo's generated development key signs this personal testing APK; it is not a production store release. Keep the signing key if you want compatible updates without uninstalling.

The optional `preview` EAS profile is configured, but uploading app source requires explicit approval. Its `.easignore` allowlist includes only app source, assets, and configuration. Photo Swipe has its own package ID; Pocket is independent.

## Device acceptance

Use disposable photos for the first device check. Verify photo permission denial/limited access, left keep, right delete confirmation and cancellation, app restart, repeat taps, album switching, and an image that cannot be loaded. Immediate deletion cannot be undone by this app. No physical Android device was connected during initial implementation.

## Initial verification

Lint, TypeScript checking, six behavior tests, and all 21 Expo Doctor checks passed. Device-level deletion and permission acceptance remain to be verified on an Android phone.

The first local APK build completed successfully. Its APK signature, package identity, both native architectures, embedded JavaScript, and media-library/SQLite/image native modules were verified. The APK is in `artifacts/photo-swipe-v1.0.0.apk` (67 MiB), signed with the development key for personal testing.

## Version 1.1 — Direct deletion and smoother swipes

On Android 12 and newer, tap **Enable direct deletion → Open settings**, then enable **Manage media** for Photo Swipe. The app checks the actual Android grant when you return. Initial photo access is still required. Without the grant, or on older Android versions, normal system deletion confirmation remains in place. Granting this access means right swipes can delete without another confirmation; there is no in-app undo.

Completed swipes animate offscreen, the next card scales forward, and nearby images are prefetched. Successful decisions consume the existing queue immediately; library updates refill it in the background. Failed or cancelled deletions return the same card and do not increase deletion counts. Reduced-motion mode disables the exit animation.

The native permission helper lives in `modules/photo-swipe-media/` and is autolinked by Expo. It requires a new Android build and is not available in Expo Go. Build locally with the existing script; the updated output is `artifacts/photo-swipe-v1.1.0.apk`. The app package ID is unchanged and versionCode is 2, so it can update the previous APK while retaining local progress. The build script backs up and restores the development signing key across Expo generation.

Version 1.1 verification: lint, TypeScript, all eight behavior tests, and all 21 Expo Doctor checks passed. The local Android release build succeeded. The APK signature matches version 1.0, and its package/version, Manage media permission, embedded JavaScript, both native architectures, and permission helper were verified. Phone-level permission and animation behavior still require testing. APK SHA-256: `8C6166614E83C49A086E946CC07E0355BC96EF22C61A8E2847E680E6AC3C9802`.

## Version 1.2 — Change album

The review-kept-photos reset control has been removed. Tap **Change album** above the photo to select a device album or **All photos**. The picker remains available when an album has no unreviewed photos. Switching replaces the queue, invalidates older background loads, and preserves saved keep decisions. Refreshes and refills stay within the chosen album. Album selection lasts for the current app session; a fresh launch starts with All photos.

Limited Android photo access still applies: use **Manage access** to grant access to additional photos. Selecting an album does not expand permissions or move any photos. The updated personal-testing APK is `artifacts/photo-swipe-v1.2.0.apk` (versionCode 3).

Verification: lint, TypeScript checking, and all nine behavior tests passed. The local Android build succeeded. APK signature verification confirmed the same signing certificate as earlier versions; package/version, both native architectures, the embedded album picker, and removal of the reset control were checked. Phone testing remains. APK SHA-256: `46D675C45F62C427901B3C4CFF82E156242D542BDE5E21270040267444C5212C`.

## Version 1.3 — Flick branding and smaller APK

The app is now named **Flick**. The approved cobalt Ribbon F asset lives in `assets/flick-logo.png` and is used by the launcher, startup screen, and app header. Android package identity, database name, and signing key are retained so this installs over Photo Swipe and preserves local progress. The project folder remains `photo swipe/`.

The default local build now targets **ARM64 only**. Expo build properties enable R8 release minification, unused-resource shrinking, and compressed native libraries. This APK does not support x86 emulators or 32-bit devices. Compressed packaging reduces APK download size; installed size may differ. No source is uploaded. Run the existing local build script; the output is `artifacts/flick-v1.3.0.apk` (versionCode 4).

Version 1.3 verification: local release build succeeded with R8 and resource shrinking. Lint, TypeScript, all nine tests, and all 21 Expo Doctor checks passed. Final APK: **21,721,640 bytes (21.72 MB)**, **69.1% smaller** than version 1.2. Signature verification confirmed the same certificate as earlier versions. APK label Flick, version 1.3.0 (4), unchanged package ID, ARM64-only libraries, native compression, embedded JavaScript, and Manage media permission were checked. R8 mapping retains the native media-management module. Generated launcher/startup assets were inspected. On-phone startup and behavior still require testing after optimization. SHA-256: `FDD6BFD61192330643A69323529D85D261DC3C3016566304F2B7412D78AE744D`.
