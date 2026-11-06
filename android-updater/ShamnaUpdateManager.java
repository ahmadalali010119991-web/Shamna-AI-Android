package com.shamna.ai;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Application;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Additive Android-only Shamna update bridge.
 * The installed app's PackageManager version and signing certificate are authoritative.
 * Updates must be signed by the SAME key. Never uninstall the original application.
 */
public final class ShamnaUpdateManager {
    private static final String MANIFEST_URL =
        "https://raw.githubusercontent.com/ahmadalali010119991-web/Shamna-AI-Android/main/shamna-update.json";
    private static final String DALLALNA_RELEASE_URL =
        "https://ftzmeimurgsqzvmcahhs.supabase.co/rest/v1/app_downloads?select=name,file_url,version";
    // Public Supabase anon key exposed in the Dallalna website. Not a privileged secret.
    private static final String DALLALNA_PUBLIC_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0em1laW11cmdzcXp2bWNhaGhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTg0NzMsImV4cCI6MjA5MTY5NDQ3M30.8kLjeKnDSlqcb0oqtVOmDKBImpyS8EN2PzJlbZxef8w";
    private static final String PREFERENCES = "shamna_native_update_v1";
    private static final String CHANNEL = "shamna_app_updates";
    private static final long CHECK_INTERVAL_MS = 60L * 1000;
    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);
    private static ShamnaUpdateManager instance;

    private final Activity activity;
    private final SharedPreferences preferences;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long lastCheck;
    private boolean visible = true;
    private boolean promptVisible;
    private boolean installationPrompted;
    private long promptingVersion;
    private Release lastRelease;
    private BroadcastReceiver downloadedReceiver;

    private static final class Release {
        long code;
        boolean direct;
        String version;
        String apkUrl;
        String sha256;
        String message;
        long size;
    }

    private ShamnaUpdateManager(Activity activity) {
        this.activity = activity;
        this.preferences = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    public static void attach(Activity activity) {
        if (instance != null) return;
        instance = new ShamnaUpdateManager(activity);
        instance.start();
    }

    private void start() {
        if (!"com.shamna.ai".equals(activity.getPackageName())) return;
        createNotificationChannel();
        downloadedReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                    long expected = preferences.getLong("download_id", -1);
                    if (expected > 0 && expected == intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2)) {
                        checkDownloaded();
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(downloadedReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            activity.registerReceiver(downloadedReceiver, filter);
        }
        activity.getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityResumed(Activity a) {
                if (a != activity) return;
                visible = true;
                installationPrompted = false;
                checkDownloaded();
                checkForUpdates();
            }
            @Override public void onActivityPaused(Activity a) { if (a == activity) visible = false; }
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityStopped(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {
                if (a == activity) {
                    try { activity.unregisterReceiver(downloadedReceiver); } catch (Exception ignored) {}
                    if (instance == ShamnaUpdateManager.this) instance = null;
                }
            }
        });
        main.postDelayed(new Runnable() {
            @Override public void run() {
                if (instance != ShamnaUpdateManager.this) return;
                if (visible) checkForUpdates();
                main.postDelayed(this, CHECK_INTERVAL_MS);
            }
        }, CHECK_INTERVAL_MS);
        checkDownloaded();
        checkForUpdates();
    }

    private long installedCode() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        } catch (Exception ex) {
            return Long.MAX_VALUE; // Fail closed: no update if installed version is unknown.
        }
    }

    private void checkForUpdates() {
        long now = System.currentTimeMillis();
        if (now - lastCheck < 30_000 || !IN_FLIGHT.compareAndSet(false, true)) return;
        lastCheck = now;
        new Thread(() -> {
            try {
                // Fast path: read the Dallalna public published APK entry directly.
                // GitHub remains the verified metadata fallback; its scheduled
                // tasks can be delayed by GitHub and must not block discovery.
                Release release = null;
                try { release = queryPublishedRelease(); } catch (Exception ignored) {}
                if (release == null) {
                HttpURLConnection c = (HttpURLConnection) new URL(MANIFEST_URL).openConnection();
                c.setConnectTimeout(12000);
                c.setReadTimeout(12000);
                c.setRequestProperty("Cache-Control", "no-cache");
                c.setRequestProperty("Accept", "application/json");
                c.setInstanceFollowRedirects(false);
                int status = c.getResponseCode();
                if (status != 200) throw new IllegalStateException("metadata HTTP " + status);
                byte[] bytes;
                try (InputStream input = c.getInputStream()) {
                    bytes = readLimited(input, 12000);
                } finally { c.disconnect(); }
                JSONObject json = new JSONObject(new String(bytes, "UTF-8"));
                release = parseRelease(json);
                }
                if (release == null || !isNewerRelease(release)) return;
                final Release ready = release;
                main.post(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    lastRelease = ready;
                    showUpdateNotice(ready);
                });
            } catch (Exception ignored) {
                // Network failure never blocks Shamna AI or makes an old build "latest".
            } finally {
                IN_FLIGHT.set(false);
            }
        }, "ShamnaUpdateCheck").start();
    }


    /** Compare dotted numeric release names by component, never lexicographically. */
    private static int compareVersions(String a, String b) {
        if (a == null || b == null ||
            !a.matches("[0-9]+(\\.[0-9]+){1,3}") ||
            !b.matches("[0-9]+(\\.[0-9]+){1,3}")) return Integer.MIN_VALUE;
        try {
            String[] aa = a.split("\\."), bb = b.split("\\.");
            int count = Math.max(aa.length, bb.length);
            for (int i = 0; i < count; i++) {
                long av = i < aa.length ? Long.parseLong(aa[i]) : 0;
                long bv = i < bb.length ? Long.parseLong(bb[i]) : 0;
                if (av != bv) return av > bv ? 1 : -1;
            }
            return 0;
        } catch (NumberFormatException ex) { return Integer.MIN_VALUE; }
    }

    private String installedVersionName() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return info.versionName;
        } catch (Exception ignored) { return null; }
    }

    private boolean isNewerRelease(Release r) {
        if (r == null) return false;
        if (!r.direct) return r.code > installedCode();
        return r.code > installedCode()
            && compareVersions(r.version, installedVersionName()) > 0;
    }

    private static boolean isTrustedApkUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            return "https".equals(uri.getScheme())
                && "ftzmeimurgsqzvmcahhs.supabase.co".equals(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1
                && uri.getQuery() == null && uri.getFragment() == null
                && uri.getPath() != null
                && uri.getPath().startsWith("/storage/v1/object/public/site-assets/")
                && uri.getPath().endsWith(".apk");
        } catch (Exception ex) { return false; }
    }

    /** Guest query, same public source as Dallalna's /install page. */
    private Release queryPublishedRelease() throws Exception {
        long code = installedCode();
        if (code == Long.MAX_VALUE || code < 1 || code >= 999999L) return null;
        HttpURLConnection c = (HttpURLConnection) new URL(DALLALNA_RELEASE_URL).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(10000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("apikey", DALLALNA_PUBLIC_KEY);
        c.setRequestProperty("Authorization", "Bearer " + DALLALNA_PUBLIC_KEY);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("Cache-Control", "no-cache");
        byte[] bytes;
        try {
            if (c.getResponseCode() != 200) return null;
            try (InputStream input = c.getInputStream()) {
                bytes = readLimited(input, 300000);
            }
        } finally { c.disconnect(); }
        JSONArray data = new JSONArray(new String(bytes, "UTF-8"));
        JSONObject entry = null;
        for (int i = 0; i < data.length(); i++) {
            JSONObject row = data.optJSONObject(i);
            if (row == null) continue;
            String name = row.optString("name", "");
            if (name.contains("شامنا") || name.toLowerCase(Locale.ROOT).contains("shamna")) {
                if (entry != null) return null; // Ambiguous listing; fail closed.
                entry = row;
            }
        }
        if (entry == null) return null;
        // Dallalna's public app_downloads listing currently has version=null.
        // Read the real APK manifest using a bounded HTTP Range request once
        // per changed immutable asset URL. Do not trust a manually typed label.
        String url = entry.optString("file_url", "");
        if (!isTrustedApkUrl(url)) return null;
        long publishedCode=0;
        String publishedName="";
        String cached = preferences.getString("probe_url", "");
        if (url.equals(cached)) {
            publishedCode = preferences.getLong("probe_code", 0);
            publishedName = preferences.getString("probe_name", "");
        } else {
            ShamnaApkVersionProbe.Version version = ShamnaApkVersionProbe.inspectRemote(url);
            if (version == null || !activity.getPackageName().equals(version.packageName))
                return null; // Wrong package, missing manifest or unavailable Range.
            publishedCode=version.versionCode;
            publishedName=version.versionName;
            preferences.edit().putString("probe_url",url)
                .putLong("probe_code",publishedCode).putString("probe_name",publishedName)
                .apply();
        }
        if (publishedCode <= code || compareVersions(publishedName, installedVersionName()) <= 0)
            return null;
        Release r = new Release();
        r.code = publishedCode;
        r.direct = true;
        r.version = publishedName;
        r.apkUrl = url;
        r.message = "تحديث شامنا AI " + publishedName + " متوفر على دلّالنا. اضغط لتنزيله وتثبيته فوق نسختك الحالية.";
        r.sha256 = ""; // The Android package and original signer are verified before installation.
        r.size = 0;
        return r;
    }

    private Release parseRelease(JSONObject data) {
        Release r = new Release();
        r.code = data.optLong("versionCode", 0);
        r.version = data.optString("versionName", "");
        r.apkUrl = data.optString("apkUrl", "");
        r.sha256 = data.optString("apkSha256", "").toLowerCase(Locale.ROOT);
        r.message = data.optString("message", "يتوفر إصدار أحدث من شامنا AI.");
        r.size = data.optLong("apkSize", 0);
        if (r.code <= installedCode() || r.code > 1_000_000
            || !r.version.matches("[0-9A-Za-z._-]{1,24}")
            || !r.sha256.matches("[a-f0-9]{64}")
            || r.size < 10000 || r.size > 100_000_000) return null;
        try {
            Uri uri = Uri.parse(r.apkUrl);
            String host = uri.getHost();
            boolean trusted = "https".equals(uri.getScheme()) && uri.getUserInfo() == null
                && uri.getPort() == -1 && uri.getQuery() == null && uri.getFragment() == null
                && (("ftzmeimurgsqzvmcahhs.supabase.co".equals(host)
                    && uri.getPath().startsWith("/storage/v1/object/public/site-assets/")
                    && uri.getPath().endsWith(".apk"))
                    || ("github.com".equals(host)
                    && uri.getPath().startsWith("/ahmadalali010119991-web/Shamna-AI-Android/releases/download/")
                    && uri.getPath().endsWith(".apk")));
            return trusted ? r : null;
        } catch (Exception ignored) { return null; }
    }

    private void showUpdateNotice(Release release) {
        if (!isNewerRelease(release) || promptVisible || !visible) return;
        if (promptingVersion == release.code) return;
        promptingVersion = release.code;
        promptVisible = true;
        showNotification(release);
        new AlertDialog.Builder(activity)
            .setTitle("تحديث جديد لشامنا AI — " + release.version)
            .setMessage(release.message + "\n\nيمكن تثبيت الإصدار فوق النسخة الحالية دون حذف المحادثات أو البيانات، بشرط مطابقة توقيع التطبيق.")
            .setPositiveButton("تحميل التحديث", (dialog, which) -> downloadRelease(release))
            .setNegativeButton("لاحقًا", (dialog, which) -> {})
            .setOnDismissListener(dialog -> promptVisible = false)
            .show();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager n = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        if (n != null) n.createNotificationChannel(new NotificationChannel(
            CHANNEL, "تحديثات شامنا AI", NotificationManager.IMPORTANCE_DEFAULT));
    }

    private void showNotification(Release r) {
        if (Build.VERSION.SDK_INT >= 33 &&
            activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return; // In-app dialog still appears. Do not force notification permission.
        }
        NotificationManager n = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        if (n == null) return;
        Intent launch = activity.getPackageManager().getLaunchIntentForPackage(activity.getPackageName());
        if (launch == null) return;
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(activity, 9931, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(activity, CHANNEL) : new Notification.Builder(activity);
        builder.setSmallIcon(activity.getApplicationInfo().icon)
            .setContentTitle("تحديث شامنا AI " + r.version + " متوفر")
            .setContentText("افتح التطبيق لتنزيل النسخة الجديدة وتثبيتها")
            .setContentIntent(pi).setAutoCancel(true);
        n.notify(9931, builder.build());
    }

    private void downloadRelease(Release r) {
        if (!isNewerRelease(r)) return;
        try {
            String name = "Shamna-AI-" + r.version + ".apk";
            File target = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), name);
            if (target.exists() && !target.delete()) {
                throw new IllegalStateException("Cannot replace previous incomplete download");
            }
            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) throw new IllegalStateException("DownloadManager missing");
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(r.apkUrl));
            req.setTitle("شامنا AI " + r.version);
            req.setDescription("تنزيل تحديث موقّع للتثبيت فوق النسخة الحالية");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name);
            long id = dm.enqueue(req);
            preferences.edit().putLong("download_id", id)
                .putLong("download_code", r.code).putString("download_version", r.version)
                .putString("download_sha", r.sha256).putBoolean("download_direct", r.direct)
                .putString("download_file", target.getAbsolutePath())
                .apply();
            Toast.makeText(activity, "بدأ تنزيل تحديث شامنا AI " + r.version, Toast.LENGTH_LONG).show();
        } catch (Exception ex) {
            Toast.makeText(activity, "تعذّر بدء التنزيل، حاول مرة أخرى.", Toast.LENGTH_LONG).show();
        }
    }

    private void checkDownloaded() {
        long id = preferences.getLong("download_id", -1);
        long code = preferences.getLong("download_code", 0);
        if (id <= 0) return;
        if (code <= installedCode()) { clearDownload(); return; }
        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return;
        try (android.database.Cursor cursor = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_FAILED) {
                clearDownload();
                Toast.makeText(activity, "فشل تنزيل التحديث؛ يمكنك إعادة المحاولة.", Toast.LENGTH_LONG).show();
            } else if (status == DownloadManager.STATUS_SUCCESSFUL) {
                if (!installationPrompted) {
                    installationPrompted = true;
                    new Thread(() -> verifyAndOfferInstallation(dm, id, code), "ShamnaApkVerify").start();
                }
            }
        } catch (Exception ignored) {}
    }

    private void verifyAndOfferInstallation(DownloadManager dm, long id, long candidateCode) {
        try {
            File f = new File(preferences.getString("download_file", ""));
            if (!f.isFile() || f.length() < 10000 || f.length() > 100_000_000) throw new SecurityException("missing APK");
            String expected = preferences.getString("download_sha", "");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] b = new byte[65536]; int read;
                while ((read = in.read(b)) != -1) digest.update(b, 0, read);
            }
            String actual = toHex(digest.digest());
            // When the release comes directly from Dallalna, its public index
            // does not carry a checksum. The Android signing certificate and
            // installed package identity below remain mandatory.
            if (!expected.isEmpty() && !actual.equals(expected))
                throw new SecurityException("wrong file hash");
            PackageManager pm = activity.getPackageManager();
            int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
            PackageInfo apk = pm.getPackageArchiveInfo(f.getAbsolutePath(), flags);
            PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), flags);
            if (apk == null || !activity.getPackageName().equals(apk.packageName)) throw new SecurityException("wrong package");
            long fileCode = Build.VERSION.SDK_INT >= 28 ? apk.getLongVersionCode() : apk.versionCode;
            long oldCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
            boolean direct = preferences.getBoolean("download_direct", false);
            if (fileCode <= oldCode || fileCode != candidateCode)
                throw new SecurityException("outdated APK");
            String advertised = preferences.getString("download_version", "");
            if (!advertised.equals(apk.versionName)) throw new SecurityException("APK version name mismatch");
            Signature[] current = Build.VERSION.SDK_INT >= 28
                ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
            Signature[] incoming = Build.VERSION.SDK_INT >= 28
                ? apk.signingInfo.getApkContentsSigners() : apk.signatures;
            if (current == null || incoming == null || current.length != incoming.length
                || current.length == 0) throw new SecurityException("unknown signing identity");
            for (Signature candidate : current) {
                boolean matched = false;
                for (Signature signer : incoming)
                    if (MessageDigest.isEqual(candidate.toByteArray(), signer.toByteArray())) matched = true;
                if (!matched) throw new SecurityException("different APK signer");
            }
            Uri downloaded = dm.getUriForDownloadedFile(id);
            if (downloaded == null || !"content".equals(downloaded.getScheme())) throw new SecurityException("no secure download URI");
            main.post(() -> offerInstall(downloaded, fileCode));
        } catch (Exception ex) {
            clearDownload();
            main.post(() -> Toast.makeText(activity,
                "تعذّر اعتماد التحديث: هوية التطبيق أو التوقيع أو سلامة الملف غير متطابقة.",
                Toast.LENGTH_LONG).show());
        }
    }

    private void offerInstall(Uri uri, long code) {
        if (activity.isFinishing() || code <= installedCode()) return;
        new AlertDialog.Builder(activity)
            .setTitle("اكتمل تنزيل تحديث شامنا AI")
            .setMessage("تم التحقق من الملف والتوقيع. هل تريد تثبيته الآن فوق التطبيق الحالي؟")
            .setPositiveButton("تثبيت التحديث", (dialog, which) -> {
                if (Build.VERSION.SDK_INT >= 26 &&
                    !activity.getPackageManager().canRequestPackageInstalls()) {
                    Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(permission);
                    Toast.makeText(activity, "فعّل السماح بالتثبيت من هذا التطبيق ثم ارجع لتثبيت التحديث.", Toast.LENGTH_LONG).show();
                    return;
                }
                Intent installer = new Intent(Intent.ACTION_VIEW);
                installer.setDataAndType(uri, "application/vnd.android.package-archive");
                installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(installer);
            })
            .setNegativeButton("لاحقًا", (dialog, which) -> {})
            .show();
    }

    private void clearDownload() {
        preferences.edit().remove("download_id").remove("download_code")
            .remove("download_sha").remove("download_direct")
            .remove("download_file").remove("download_version").apply();
    }

    private static byte[] readLimited(InputStream in, int maximum) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[2048]; int count; int total = 0;
        while ((count = in.read(chunk)) != -1) {
            total += count;
            if (total > maximum) throw new SecurityException("metadata too large");
            output.write(chunk, 0, count);
        }
        return output.toByteArray();
    }

    private static String toHex(byte[] b) {
        StringBuilder out = new StringBuilder();
        for (byte x : b) out.append(String.format(Locale.ROOT, "%02x", x & 0xff));
        return out.toString();
    }
}
