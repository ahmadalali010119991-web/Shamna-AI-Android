import io,json,urllib.request,zipfile
from pathlib import Path
from PIL import Image
SRC="https://midan-al-khabar.vercel.app/"
def get(path):
    return urllib.request.urlopen(urllib.request.Request(SRC+path,headers={"User-Agent":"MidanRecoveryBuilder/1.2.0"}),timeout=40).read()
rel=json.loads(get("api/release?app=midan-alkhabar"))
assert rel.get("versionCode")==2 and rel.get("packageName")=="com.midanalkhabar.app", "Live release mismatch"
with zipfile.ZipFile(io.BytesIO(get("downloads/midan-android-source.zip"))) as z:
    z.extractall("_midan")
base=Path("_midan")
gradle=base/"app/build.gradle";s=gradle.read_text()
assert "versionCode 1" in s and "versionName '1.0.0'" in s
gradle.write_text(s.replace("versionCode 1","versionCode 3").replace("versionName '1.0.0'","versionName '1.2.0'").replace("dependencies {","dependencies { implementation 'androidx.core:core:1.13.1'; "))
main=base/"app/src/main/java/com/midanalkhabar/app/MainActivity.java";s=main.read_text()
needle="@JavascriptInterface public void startUpdate(String manifestJson)"
assert needle in s
main.write_text(s.replace(needle,'@JavascriptInterface public void shareImagePng(String dataUrl){if(trusted())AwarenessImageShare.share(MainActivity.this,dataUrl);}\n        '+needle))
manifest=base/"app/src/main/AndroidManifest.xml";s=manifest.read_text()
needle='<service android:name=".NewsMessagingService"'
assert needle in s
s=s.replace(needle,'<provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/share_paths"/></provider>\n     '+needle)
manifest.write_text(s)
xml=base/"app/src/main/res/xml/share_paths.xml";xml.parent.mkdir(parents=True,exist_ok=True)
xml.write_text('<?xml version="1.0" encoding="utf-8"?><paths xmlns:android="http://schemas.android.com/apk/res/android"><cache-path name="midan_shared" path="shared/"/></paths>')
java=base/"app/src/main/java/com/midanalkhabar/app/AwarenessImageShare.java"
java.write_text("""package com.midanalkhabar.app;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
final class AwarenessImageShare {
 private AwarenessImageShare(){}
 static void share(Activity activity,String dataUrl){
  final String prefix="data:image/png;base64,";
  if(dataUrl==null||!dataUrl.startsWith(prefix)||dataUrl.length()>7500000)return;
  new Thread(()->{
   try{
    byte[] png=Base64.decode(dataUrl.substring(prefix.length()),Base64.DEFAULT);
    if(png.length<80||png.length>5200000||png[0]!=(byte)137||png[1]!=80||png[2]!=78||png[3]!=71)return;
    File dir=new File(activity.getCacheDir(),"shared");
    if(!dir.exists()&&!dir.mkdirs())return;
    File file=new File(dir,"midan-awareness-"+System.currentTimeMillis()+".png");
    try(FileOutputStream out=new FileOutputStream(file)){out.write(png);}
    Uri uri=FileProvider.getUriForFile(activity,BuildConfig.APPLICATION_ID+".fileprovider",file);
    activity.runOnUiThread(()->{
     try{
      Intent i=new Intent(Intent.ACTION_SEND);i.setType("image/png");
      i.putExtra(Intent.EXTRA_STREAM,uri);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      activity.startActivity(Intent.createChooser(i,"مشاركة رسالة ميدان الخبر"));
     }catch(Exception ignored){}
    });
   }catch(Exception ignored){}
  },"midan-share-png").start();
 }
}
""")
icon=Image.open(io.BytesIO(get("assets/midan-brand-2026.webp"))).convert("RGBA")
for dpi,size in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    dst=base/f"app/src/main/res/mipmap-{dpi}/ic_launcher.png"
    icon.resize((size,size),Image.Resampling.LANCZOS).save(dst,"PNG")
Path("MIDAN_RELEASE_SAFETY.json").write_text(json.dumps({"packageName":"com.midanalkhabar.app","oldCode":2,"newCode":3,"newVersion":"1.2.0","oldSHA256":rel.get("sha256"),"signedWithOriginalKey":False,"safeToPublish":False},ensure_ascii=False,indent=2))
print("Prepared Midan Android v1.2.0 source, no secrets, no publication.")
