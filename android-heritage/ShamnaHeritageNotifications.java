package com.shamna.ai;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.util.Calendar;
import java.util.Locale;
import java.util.Random;

/**
 * Entirely additive Shamna heritage notices. No web, no UI control panel,
 * no new app screen except a standalone text-only notification reader.
 * Notifications always respect Android's runtime permission, sound and DND.
 */
public final class ShamnaHeritageNotifications {
    private ShamnaHeritageNotifications() {}

    private static final String PACKAGE = "com.shamna.qa";
    private static final String PREF = "shamna_heritage_notices_v1";
    private static final String CHANNEL = "shamna_heritage_soft_v1";
    private static final String ACTION_SHOW = PACKAGE + ".heritage.SHOW";
    private static final int ALARM_REQUEST = 8412;
    private static final int NOTIFICATION_BASE = 84120;
    private static final int PERMISSION_REQUEST = 8421;
    // One planned notification each clock hour, at a fixed offset.
    // Actual delivery is subject to Android Doze/battery scheduling.
    private static final long HOUR_MS = 60L * 60 * 1000;
    private static final int MINUTE_WITHIN_HOUR = 5; // Calculator uses :35 so both do not alert together.
    private static final String SOUND_AUTHORITY = PACKAGE + ".heritage.audio";
    private static final String SOUND_NAME = "shamna_heritage_chime.wav";
    private static final Random RAND = new Random();

    /** Called only by the already-existing ShamnaUpdateManager.attach(Activity). */
    public static void start(Activity a) {
        if (a == null || !PACKAGE.equals(a.getPackageName())) return;
        ensureNotificationChannel(a);
        scheduleNext(a, false);
        // Android 13+ enforces user approval. Ask once; never pressure a denied user.
        if (Build.VERSION.SDK_INT >= 33
            && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            android.content.SharedPreferences p = a.getSharedPreferences(PREF,0);
            if (!p.getBoolean("permission_requested",false)) {
                p.edit().putBoolean("permission_requested",true).apply();
                a.getWindow().getDecorView().post(() -> {
                    if (!a.isFinishing() && !a.isDestroyed()) {
                        a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            PERMISSION_REQUEST);
                    }
                });
            }
        }
    }

    private static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 &&
            c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && (Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled());
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent intent = new Intent(c, AlarmReceiver.class).setAction(ACTION_SHOW);
        return PendingIntent.getBroadcast(c, ALARM_REQUEST, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Every hour at the same local-clock minute; content order is shuffled. */
    private static synchronized void scheduleNext(Context c, boolean alwaysReschedule) {
        android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,0);
        long now=System.currentTimeMillis();
        Calendar next=Calendar.getInstance();
        next.setTimeInMillis(now);
        next.set(Calendar.MINUTE,MINUTE_WITHIN_HOUR);
        next.set(Calendar.SECOND,0);
        next.set(Calendar.MILLISECOND,0);
        if (next.getTimeInMillis() <= now + 15_000L) next.add(Calendar.HOUR_OF_DAY,1);
        long target=next.getTimeInMillis();
        long previous=prefs.getLong("next_at",0L);
        if (!alwaysReschedule && Math.abs(previous-target) < 30_000L) return;
        AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        if (alarm==null) return;
        PendingIntent pi=alarmIntent(c);
        // setAndAllowWhileIdle is inexact; we never demand restricted exact-alarm access.
        if (Build.VERSION.SDK_INT>=23)
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,target,pi);
        else alarm.set(AlarmManager.RTC_WAKEUP,target,pi);
        prefs.edit().putLong("next_at",target).putBoolean("started",true).apply();
    }

    /** Shuffle-bag: every one of the 79 notices is shown before any repeats. */
    private static synchronized ShamnaHeritageFacts.Fact nextFact(Context c) {
        android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,0);
        int total=ShamnaHeritageFacts.ITEMS.length;
        if (total<1) throw new IllegalStateException("No heritage notice content");
        String bag=prefs.getString("shuffled_bag","");
        String[] remaining=bag.isEmpty()?new String[0]:bag.split(",");
        int chosen=-1;
        String nextBag;
        try {
            if (remaining.length>0) {
                chosen=Integer.parseInt(remaining[0]);
                if (chosen<0||chosen>=total)throw new NumberFormatException("Invalid index");
                nextBag=bag.substring(remaining[0].length());
                if (nextBag.startsWith(",")) nextBag=nextBag.substring(1);
            } else {
                int[] shuffled=new int[total];
                for (int i=0;i<total;i++)shuffled[i]=i;
                for (int i=total-1;i>0;i--) {
                    int j=RAND.nextInt(i+1),tmp=shuffled[i];
                    shuffled[i]=shuffled[j];shuffled[j]=tmp;
                }
                int last=prefs.getInt("last_index",-1);
                if (total>1 && shuffled[0]==last) {
                    int tmp=shuffled[0];shuffled[0]=shuffled[1];shuffled[1]=tmp;
                }
                chosen=shuffled[0];
                StringBuilder buffer=new StringBuilder();
                for (int i=1;i<total;i++) {
                    if(i>1)buffer.append(',');
                    buffer.append(shuffled[i]);
                }
                nextBag=buffer.toString();
            }
        } catch (Exception badBag) {
            prefs.edit().remove("shuffled_bag").apply();
            chosen=RAND.nextInt(total);
            nextBag="";
        }
        prefs.edit().putString("shuffled_bag",nextBag).putInt("last_index",chosen).apply();
        return ShamnaHeritageFacts.ITEMS[chosen];
    }

    private static void ensureNotificationChannel(Context c) {
        if (Build.VERSION.SDK_INT<26) return;
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm==null || nm.getNotificationChannel(CHANNEL)!=null) return;
        NotificationChannel channel=new NotificationChannel(
            CHANNEL,"ومضات من التراث والحضارة الإسلامية",
            NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("إشعار معرفي كل ساعة بصوت رقيق قصير");
        channel.setShowBadge(false);
        channel.enableVibration(false);
        Uri sound=Uri.parse("content://"+SOUND_AUTHORITY+"/"+SOUND_NAME);
        AudioAttributes attributes=new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(sound,attributes);
        nm.createNotificationChannel(channel);
    }

    private static void notifyFact(Context c) {
        if (!allowed(c)) return;
        ensureNotificationChannel(c);
        ShamnaHeritageFacts.Fact fact=nextFact(c);
        String full=fact.fullText();
        String preview=fact.text.length()>98 ? fact.text.substring(0,96)+"…" : fact.text;
        android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,0);
        int serial=prefs.getInt("sent_count",0)+1;
        prefs.edit().putInt("sent_count",serial).apply();
        int notificationId=NOTIFICATION_BASE+(serial % 4);
        Intent read=new Intent(c,ReaderActivity.class);
        read.putExtra("title",fact.title);
        read.putExtra("body",full);
        read.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        PendingIntent open=PendingIntent.getActivity(c,notificationId,read,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=Build.VERSION.SDK_INT>=26
            ? new Notification.Builder(c,CHANNEL) : new Notification.Builder(c);
        builder.setSmallIcon(c.getApplicationInfo().icon)
            .setContentTitle("من تراثنا: "+fact.title)
            .setContentText(preview)
            .setStyle(new Notification.BigTextStyle().bigText(full)
                .setBigContentTitle("من تراثنا: "+fact.title))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(Notification.PRIORITY_DEFAULT)
            .setCategory(Notification.CATEGORY_RECOMMENDATION)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true);
        if (Build.VERSION.SDK_INT<26) {
            builder.setDefaults(0); // Respect silent devices, don't use loud default alert.
            builder.setSound(Uri.parse("content://"+SOUND_AUTHORITY+"/"+SOUND_NAME));
        }
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm!=null) nm.notify(notificationId,builder.build());
    }

    public static final class AlarmReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context c,Intent intent) {
            if (intent==null || !ACTION_SHOW.equals(intent.getAction()))return;
            long now=System.currentTimeMillis();
            android.content.SharedPreferences prefs=c.getSharedPreferences(PREF,0);
            // Android may redeliver an alarm: at most one notice per clock hour.
            long hourBucket=now/HOUR_MS;
            long lastBucket=prefs.getLong("last_hour_bucket",-1L);
            if (lastBucket!=hourBucket) {
                notifyFact(c);
                prefs.edit().putLong("last_hour_bucket",hourBucket)
                    .putLong("last_sent",now).apply();
            }
            scheduleNext(c,true);
        }
    }

    public static final class BootReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context c,Intent intent) {
            if (intent==null)return;
            String action=intent.getAction();
            if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
                ensureNotificationChannel(c);
                scheduleNext(c,true);
            }
        }
    }

    /**
     * The notification tap opens *only* the complete text, not MainActivity,
     * not the Shamna web app and not a notification settings panel.
     */
    public static final class ReaderActivity extends Activity {
        @Override protected void onCreate(Bundle state) {
            super.onCreate(state);
            String title=getIntent().getStringExtra("title");
            String text=getIntent().getStringExtra("body");
            if (title==null || text==null || text.length()>12000) {
                finish();return;
            }
            int outer=dp(20),space=dp(16);
            GradientDrawable background=new GradientDrawable();
            background.setColor(Color.rgb(11,34,27));
            background.setCornerRadius(dp(18));
            background.setStroke(dp(1),Color.rgb(191,151,77));
            LinearLayout layout=new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
            layout.setPadding(outer,space,outer,space);
            layout.setBackground(background);
            TextView headline=new TextView(this);
            headline.setText(title);
            headline.setGravity(Gravity.RIGHT);
            headline.setTextColor(Color.rgb(234,196,116));
            headline.setTextSize(21);
            headline.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
            layout.addView(headline,new LinearLayout.LayoutParams(-1,-2));
            TextView body=new TextView(this);
            body.setText(text);
            body.setTextIsSelectable(true);
            body.setTextColor(Color.rgb(251,249,242));
            body.setTextSize(17);
            body.setLineSpacing(dp(5),1.15f);
            body.setGravity(Gravity.RIGHT);
            ScrollView scroll=new ScrollView(this);
            scroll.setFillViewport(false);
            scroll.addView(body);
            LinearLayout.LayoutParams reading=new LinearLayout.LayoutParams(-1,0,1f);
            reading.topMargin=space;
            layout.addView(scroll,reading);
            Button close=new Button(this);
            close.setText("إغلاق");
            close.setOnClickListener(v->finish());
            LinearLayout.LayoutParams button=new LinearLayout.LayoutParams(-1,-2);
            button.topMargin=dp(12);
            layout.addView(close,button);
            setContentView(layout);
            // Bound the dialog to a readable height so even long sources
            // remain scrollable; never navigate into the main Shamna WebView.
            android.util.DisplayMetrics metrics=getResources().getDisplayMetrics();
            int width=Math.min(metrics.widthPixels-dp(28),dp(580));
            int height=(int)(metrics.heightPixels*0.76f);
            getWindow().setLayout(width,height);
        }
        private int dp(int d) {return (int)(d*getResources().getDisplayMetrics().density+0.5f);}
    }

    /** Public *read-only* notification sound URI; never serves other app files. */
    public static final class SoundProvider extends ContentProvider {
        @Override public boolean onCreate() { return true; }
        @Override public String getType(Uri uri) {
            return uri!=null && ("/"+SOUND_NAME).equals(uri.getPath())?"audio/wav":null;
        }
        @Override public ParcelFileDescriptor openFile(Uri uri,String mode) throws FileNotFoundException {
            if (!"r".equals(mode) || uri==null || !("/"+SOUND_NAME).equals(uri.getPath()))
                throw new FileNotFoundException("Sound not found");
            Context ctx=getContext();
            if (ctx==null) throw new FileNotFoundException("No app context");
            File destination=new File(ctx.getFilesDir(),SOUND_NAME);
            try {
                if (!destination.isFile() || destination.length()<1000) {
                    try (InputStream in=ctx.getAssets().open(SOUND_NAME);
                         FileOutputStream out=new FileOutputStream(destination,false)) {
                        byte[] buf=new byte[8192];int n;
                        while ((n=in.read(buf))!=-1)out.write(buf,0,n);
                    }
                }
                return ParcelFileDescriptor.open(destination,ParcelFileDescriptor.MODE_READ_ONLY);
            } catch (Exception ex) {
                throw new FileNotFoundException("Unable to read public notification sound");
            }
        }
        @Override public Cursor query(Uri uri,String[] proj,String selection,
            String[] args,String sortOrder) {return null;}
        @Override public Uri insert(Uri uri,ContentValues values) {
            throw new UnsupportedOperationException("Read-only chime");
        }
        @Override public int update(Uri uri,ContentValues values,String s,String[] a) {
            throw new UnsupportedOperationException("Read-only chime");
        }
        @Override public int delete(Uri uri,String s,String[] a) {
            throw new UnsupportedOperationException("Read-only chime");
        }
    }
}
