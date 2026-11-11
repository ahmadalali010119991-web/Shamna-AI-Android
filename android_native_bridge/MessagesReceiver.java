package com.syrianlira.calculator;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.SecureRandom;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Calendar;

/**
 * Receives only the original advice-reminder manifest actions; does not alter
 * the APK updater, gold/rates fetchers, native image bridge, or heritage module.
 *
 * All advice notifications are drawn from assets/awareness-53.json exactly as
 * supplied by the application owner. No additional/new religious quotes.
 */
public final class MessagesReceiver extends BroadcastReceiver {
  private static final String PREFS="gentle_notifications";
  private static final String STATE="hasibat_awareness_native_53_v1";
  private static final String CHANNEL="hasibat_awareness_53_v1";
  private static final String MORNING="com.syrianlira.calculator.MORNING";
  private static final String LESSON="com.syrianlira.calculator.LESSON";
  private static final int ID_MORNING=742401;
  private static final int ID_LESSON=742402;
  private static final int NOTIFICATION_MORNING=742411;
  private static final int NOTIFICATION_LESSON=742412;
  private static final SecureRandom RANDOM=new SecureRandom();

  @Override public void onReceive(Context context,Intent intent) {
    if(context==null || intent==null)return;
    String action=intent.getAction();
    if(MORNING.equals(action)||LESSON.equals(action)){
      final boolean morning=MORNING.equals(action);
      if(permitted(context,morning)){
        publishFromOwnerFile(context,morning);
      }
      sync(context,false);
      return;
    }
    if(Intent.ACTION_BOOT_COMPLETED.equals(action) ||
       Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
       Intent.ACTION_TIME_CHANGED.equals(action) ||
       Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
      sync(context,true);
    }
  }
  public static void sync(Context c,boolean resetAfterBoot) {
    if(c==null)return;
    SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    boolean enabled=p.getBoolean("enabled",false);
    AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
    if(alarms==null)return;
    for(boolean morning:new boolean[]{true,false}){
      String action=morning?MORNING:LESSON;
      int requestCode=morning?ID_MORNING:ID_LESSON;
      Intent i=new Intent(c,MessagesReceiver.class).setAction(action);
      PendingIntent pending=PendingIntent.getBroadcast(c,requestCode,i,
        PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      if(!enabled || !p.getBoolean(morning?"morning_enabled":"lessons_enabled",true)){
        alarms.cancel(pending);
        continue;
      }
      long next=0L;
      if(!resetAfterBoot)next=p.getLong(morning?"hasibat_next_morning_53":"hasibat_next_lesson_53",0L);
      if(next<=System.currentTimeMillis()+1000L || next>System.currentTimeMillis()+48*3600000L){
        next=morning?nextMorning():nextLesson();
        p.edit().putLong(morning?"hasibat_next_morning_53":"hasibat_next_lesson_53",next).apply();
      }
      try{
        if(Build.VERSION.SDK_INT>=31 && !alarms.canScheduleExactAlarms()){
          alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending);
        }else{
          alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending);
        }
      }catch(SecurityException e){
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending);
      }
    }
  }
  private static long nextMorning() {
    Calendar c=Calendar.getInstance();
    c.set(Calendar.HOUR_OF_DAY,7);c.set(Calendar.MINUTE,0);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);
    if(c.getTimeInMillis()<=System.currentTimeMillis()+1000)c.add(Calendar.DATE,1);
    return c.getTimeInMillis();
  }
  private static long nextLesson(){
    // Silent, widely separated reminders; never an immediate unsolicited alert.
    return System.currentTimeMillis()+(6+RANDOM.nextInt(3))*3600000L;
  }
  private static boolean permitted(Context c,boolean morning){
    SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    return p.getBoolean("enabled",false) &&
      p.getBoolean(morning?"morning_enabled":"lessons_enabled",true);
  }
  private static JSONArray messages(Context c) throws Exception {
    InputStream in=c.getAssets().open("awareness-53.json");
    try{
      ByteArrayOutputStream out=new ByteArrayOutputStream(24000);
      byte[] buf=new byte[4096];int n;
      while((n=in.read(buf))!=-1){
        if(out.size()+n>48000)throw new IllegalStateException("Tip file too large");
        out.write(buf,0,n);
      }
      JSONArray json=new JSONArray(out.toString("UTF-8"));
      if(json.length()!=53)throw new IllegalStateException("Unexpected owner messages count");
      for(int i=0;i<53;i++){
        String value=json.getString(i);
        if(value==null||value.length()<12||value.length()>1000)throw new IllegalStateException("Invalid owner tip");
      }
      return json;
    }finally{in.close();}
  }
  private static final class Choice {
    final String message;
    final String nextState;
    Choice(String message,String nextState){this.message=message;this.nextState=nextState;}
  }
  private static Choice nextChoice(Context c,JSONArray messages) throws Exception{
    SharedPreferences prefs=c.getSharedPreferences(STATE,Context.MODE_PRIVATE);
    JSONObject data;
    try{data=new JSONObject(prefs.getString("rotation","{}"));}catch(Exception e){data=new JSONObject();}
    JSONArray stored=data.optJSONArray("order");
    int cursor=data.optInt("cursor",0),last=data.optInt("last",-1);
    int[] order=new int[53];boolean valid=stored!=null&&stored.length()==53&&cursor>=0&&cursor<=53;
    boolean[] seen=new boolean[53];
    if(valid){
      for(int i=0;i<53;i++){
        int n=stored.optInt(i,-1);
        if(n<0||n>=53||seen[n]){valid=false;break;}
        seen[n]=true;order[i]=n;
      }
    }
    if(!valid||cursor==53){
      for(int i=0;i<53;i++)order[i]=i;
      for(int i=52;i>0;i--){
        int j=RANDOM.nextInt(i+1);int t=order[i];order[i]=order[j];order[j]=t;
      }
      if(last>=0&&last<53&&order[0]==last){
        int swap=1+RANDOM.nextInt(52);int t=order[0];order[0]=order[swap];order[swap]=t;
      }
      cursor=0;
    }
    int index=order[cursor];
    JSONObject next=new JSONObject();
    JSONArray arr=new JSONArray();
    for(int i=0;i<53;i++)arr.put(order[i]);
    next.put("order",arr);next.put("cursor",cursor+1);next.put("last",index);
    return new Choice(messages.getString(index),next.toString());
  }
  private static synchronized void publishFromOwnerFile(Context c,boolean morning){
    try{
      NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
      if(nm==null||!nm.areNotificationsEnabled())return;
      JSONArray texts=messages(c);
      Choice choice=nextChoice(c,texts);
      if(Build.VERSION.SDK_INT>=26){
        NotificationChannel channel=new NotificationChannel(CHANNEL,"رسائل نافعة",NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("الرسائل التوعوية المعتمدة داخل حاسبة الليرة؛ بلا صوت أو اهتزاز");
        channel.setSound(null,null);channel.enableVibration(false);channel.enableLights(false);
        nm.createNotificationChannel(channel);
      }
      int icon=c.getResources().getIdentifier("ic_stat_notification_v1816","drawable",c.getPackageName());
      if(icon==0)icon=android.R.drawable.ic_dialog_info;
      PendingIntent open=PendingIntent.getActivity(c,1004,new Intent(c,SaveActivity.class)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      Notification.Builder builder=new Notification.Builder(c,CHANNEL).setSmallIcon(icon)
        .setContentTitle("رسالة نافعة").setContentText(choice.message)
        .setStyle(new Notification.BigTextStyle().bigText(choice.message))
        .setContentIntent(open).setAutoCancel(true).setWhen(System.currentTimeMillis())
        .setShowWhen(true).setSound(null).setVibrate(new long[]{0L});
      nm.notify(morning?NOTIFICATION_MORNING:NOTIFICATION_LESSON,builder.build());
      // Store the message only after Android accepts the notification.
      if(!c.getSharedPreferences(STATE,Context.MODE_PRIVATE).edit()
        .putString("rotation",choice.nextState).commit()) throw new IllegalStateException("Unable to persist 53-message rotation");
    }catch(Exception e){
      android.util.Log.w("HasibatAwareness","Could not deliver owner tip",e);
    }
  }
}
