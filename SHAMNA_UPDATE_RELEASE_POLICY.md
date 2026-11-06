# Shamna AI — Automatic Android updates and in-place installation

## Implemented app-side update flow
- `android-updater/ShamnaUpdateManager.java` is added after all existing CI source patches by `android-updater/patch_shamna_project.py`.
- The updater is attached to the existing `MainActivity` without removing camera, microphone, geolocation, downloads, background-session preservation, or WebView features.
- Checks a public metadata file (`shamna-update.json`) on app start, return to foreground, and while active; uses real installed `PackageManager` build number.
- Announces a newer version in Arabic with Download/Later actions; optionally posts an Android notification if notification permission is granted.
- Downloads through Android DownloadManager. Before opening Android's installer, verifies SHA-256, matching Android package `com.shamna.ai`, strictly higher `versionCode`, and matching installed signer.
- **Never** uninstall the user's existing application or delete conversations to perform an update; Android always requests installation approval.
- No claim of guaranteed immediate push to a fully closed/background-restricted app. That requires a configured push service such as FCM.

## Automatic metadata publication
- `.github/workflows/shamna-sync-published.yml` checks the public Dallalna `app_downloads` listing on a scheduled basis (GitHub may delay schedule runs).
- `scripts/sync_shamna_from_dallalna.py` reads the new APK URL, downloads and verifies it, and updates `shamna-update.json` **only** for a newly signed, valid `com.shamna.ai` APK.
- If the URL is unchanged, a full download is unnecessary; the script is designed to skip it.
- Fail closed when package or certificate differs or a file is missing, not silently downgrade to an unknown package/signing key.
- On 2026-11-06, Dallalna's item named Shamna points to **`com.shamna.qa`**. It is not an installable update for **`com.shamna.ai`**. Publishing the correct official APK is required before metadata synchronization can become active.

## Signing-key blocker — do not work around it
- The oldest preserved original-named Shamna APK in the project history has signer certificate SHA-256:
  `16d9d351e4da9f6bfa175adbecd337a35ac6ff6b9b1bbec3291ec956fc431dcf`.
- Its private signing key has **not** been recovered. The `adfix-test-signing.p12` key found in the QA archive is for `com.shamna.qa`, NOT for the real `com.shamna.ai` application.
- Existing `build-apk.yml` runs `gradle :app:assembleDebug`, which normally signs with an environment-specific Android Debug keystore. Builds from different ephemeral CI runners need **not** have the same certificate, and cannot be promised as upgrades.
- **Do not release, distribute, or auto-publish the current CI debug APK as an in-place update** until its signing certificate is independently checked against the certificate on the user's installed official application.
- Recover the actual original official signing keystore and password from the owner or original build machine (not from a public APK). Store signing credentials only as protected GitHub Actions secrets; never commit them.
- On each release check: `packageName == com.shamna.ai`, identical signing certificate, incremented `versionCode`, valid versionName, SHA-256, and functional smoke tests of voice, images, downloads, chat, background state, camera and location.
- If the old key no longer exists, Android will NOT install a differently signed APK over the old app without uninstalling. Do not claim otherwise. A separate transition/migration approach would need explicit planning and user consent.

## End-to-end acceptance test (still required on a real device)
1. Keep the currently installed official Shamna build and data.
2. Publish a properly signed, higher-version **official** `com.shamna.ai` APK on Dallalna.
3. Without manually editing GitHub update JSON, verify the automatic monitor publishes its metadata; note GitHub cron is best-effort.
4. Open the older official APK and verify the in-app notice appears, newer version can download and install on top, and conversations/files/settings remain intact.
5. Relaunch and verify the installed app no longer offers its own version as an update.
6. Test network failure, stale/malformed JSON, wrong package, wrong signature, lower/equal version, interrupted downloads and denied install permission — all fail without data loss.

The app-side code and GitHub development build have compiled successfully. **A production-ready signed in-place APK has not yet been delivered, because the official signing key remains unverified.**
