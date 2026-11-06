## Shamna QA 1.4 failure and definitive client-side repair (2026-11-06)

- Incident: User uploaded 1.4 to Dallalna. Older Shamna QA 1.3 did not announce it because the GitHub `shamna-qa-update.json` manifest was still 1.2; GitHub's scheduled workflow had not executed promptly. Its manual verification run then found the published 1.4 (code 5, signed QA), updated the manifest automatically via its own commit, and confirmed SHA-256 `c4dc890ba8f2a9f85710f89ab6a40131f34186fd65f8e99d179730a5189c812a`.
- Dallalna's public `app_downloads` entry has `version=null`. It cannot be used to infer Android versionCode; **never rely on a manually entered Dallalna version label**.
- Fixed version: signed compatible `com.shamna.qa` 1.5 (code 6). The native update manager directly queries the public Dallalna listing on launch/resume and every **60 seconds while the Activity is active**. It detects new UUID APK URLs and uses a 256-KiB HTTP Range probe to read the actual binary AndroidManifest `package/versionCode/versionName` without downloading the whole release. The result is cached by URL. GitHub verified metadata remains the fallback.
- ZIP and binary manifest decoder is in `android-updater/ShamnaApkVersionProbe.java`; the GitHub release-build workflow validates the real 1.4 published APK header using the same compiled Java parser.
- Both official and QA workflows include the additive probe component; old app UI/download/camera/microphone/data are preserved. Version 1.5 was signed with the original **QA 1.2–1.4** signing key and its V2/V3 signature, package `com.shamna.qa`, and code 6 were verified. All assets except AndroidManifest.xml and updater classes4.dex are byte-for-byte identical to 1.4.
- On download, Android `PackageManager` checks the new APK package, **exact** versionCode/versionName claimed from the published binary manifest, and exact currently installed signing identity. Same-or-older releases cannot install. User approval through Android package installer remains mandatory.
- The GitHub release sync now rejects all code >= 6 unless APK contains `ShamnaApkVersionProbe`, `shamna-qa-update.json` fallback and the direct Dallalna lookup. The signer, name, and package checks remain mandatory.
- Limit: fully backgrounded/killed apps cannot be promised instant push from a local polling timer. True immediate closed-app notifications require a real push backend (e.g. FCM), a server publishing trigger and Android notification permission. Do not claim that the minute check delivers closed-app push.
- Upgrade path: 1.3/1.4 can only read GitHub metadata, so users may need to open them after the scheduled sync; 1.5 is the first release with **independent direct** Dallalna monitoring. Verify on a real phone before broad release.
- Do not publish the QA private signing key or password to this public repository.

## Current device-compatible Shamna QA application (verified 2026-11-06)

- User-provided installed reference APK: package `com.shamna.qa`, versionName `1.2`, versionCode `3`, SHA-256 `e4f5df841b6293abce75cbed5ecbc88148e80e80bbea545cb2082229b89cb423`.
- Original QA signing certificate SHA-256 `65f1224f1c8539870478c1ffccfb82e02adf803686eab1a17385e547239f863e` matches the privately held test signing keystore from the owner's earlier source archive. Never commit or publish that private keystore.
- A minimal additive QA update `1.3` (versionCode `4`) was built from the exact baseline; only binary AndroidManifest.xml, hooked classes2.dex, and added classes4.dex differ. All other files are preserved byte-for-byte; signature V2 and V3 verified against the original QA signing certificate.
- Existing 1.2 has **no built-in self-update bridge**, so upgrading 1.2→1.3 requires one manual APK installation. Once 1.3 is installed, newer correctly signed QA versions can be announced inside the app via the separate `shamna-qa-update.json` metadata channel.
- `.github/workflows/shamna-qa-sync-published.yml` checks Dallalna automatically using `scripts/sync_shamna_qa_from_dallalna.py`, pins the *QA* signing certificate and package, and never treats a same-or-older version as newer.
- Initial sync was verified by GitHub Actions run 42272501866: the published QA 1.2 was correctly recognized as not newer, so no fake update was announced. The five-minute schedule remains best-effort and is not guaranteed exactly every five minutes.
- Do not confuse this **working QA in-place upgrade path** with the separate production-named package `com.shamna.ai`. The latter still requires independent access to its own original signing key; the QA key cannot update it.
- Test the signed QA 1.3 APK on the actual device, including preservation of existing local data. Then upload a newly signed QA 1.4 to Dallalna and confirm autonomous discovery and installation.
- Future signed QA APKs MUST keep `com.shamna.qa`, the same signer certificate, an increased versionCode, all existing features, and pass rollback/regression checks. No uninstall.

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
