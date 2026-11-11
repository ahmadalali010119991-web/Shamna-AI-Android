package com.syrianlira.calculator;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.net.Uri;
import android.provider.MediaStore;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.IOException;
import java.io.OutputStream;

/* Native image bridge: keep the existing production MainActivity intact. */
public class SaveActivity extends MainActivity {
  private static final String PREFIX="data:image/png;base64,";
  private static final int REQUEST_DOCUMENT=61082;
  private static final String SETTINGS="hasibat_exchange_preferences_v1";
  private WebView resultsWeb;
  private byte[] pendingImage;
  private boolean pendingShare;
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    resultsWeb=findWeb(findViewById(android.R.id.content));
    if(resultsWeb!=null) resultsWeb.addJavascriptInterface(this,"ResultShareHost");
    // Register only silent owner-authored advice; existing update alerts remain untouched.
    try{MessagesReceiver.sync(getApplicationContext(),false);}catch(Exception e){android.util.Log.w("HasibatAwareness","Advice schedule unavailable",e);}
  }
  @JavascriptInterface public void syncAdviceSchedule(){
    try{MessagesReceiver.sync(getApplicationContext(),false);}catch(Exception e){android.util.Log.w("HasibatAwareness","Settings sync unavailable",e);}
  }
  private WebView findWeb(View node) {
    if(node instanceof WebView) return (WebView)node;
    if(node instanceof ViewGroup) {
      ViewGroup group=(ViewGroup)node;
      for(int i=0;i<group.getChildCount();i++) {
        WebView w=findWeb(group.getChildAt(i));
        if(w!=null) return w;
      }
    }
    return null;
  }
  @JavascriptInterface public String getCurrencySettings() {
    return getSharedPreferences(SETTINGS,MODE_PRIVATE).getString("visible_currencies","");
  }
  @JavascriptInterface public void saveCurrencySettings(String json) {
    if(json==null || json.length()>4096) return;
    try {
      JSONObject o=new JSONObject(json);
      JSONArray a=o.optJSONArray("active");
      if(a==null || a.length()<1 || a.length()>16) return;
      getSharedPreferences(SETTINGS,MODE_PRIVATE).edit().putString("visible_currencies",json).apply();
    } catch(Exception ignored) {}
  }
  @JavascriptInterface public void saveResultsImage(String dataUrl,String name) {
    processImage(dataUrl,name,false);
  }
  @JavascriptInterface public void shareResultsImage(String dataUrl,String name) {
    processImage(dataUrl,name,true);
  }
  private void processImage(String input,String name,final boolean share) {
    try {
      byte[] data=decode(input);
      final String filename=cleanName(name);
      if(Build.VERSION.SDK_INT<29) {
        synchronized(this) {
          if(pendingImage!=null) throw new IOException("Another save request active");
          pendingImage=data; pendingShare=share;
        }
        runOnUiThread(new Runnable(){@Override public void run(){
          try {
            Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/png");
            i.putExtra(Intent.EXTRA_TITLE,filename);
            startActivityForResult(i,REQUEST_DOCUMENT);
          } catch(Exception e) {
            synchronized(SaveActivity.this){pendingImage=null;}
            feedback("تعذر فتح نافذة حفظ الصورة.",true);
          }
        }});
        return;
      }
      final Uri uri=saveToGallery(data,filename);
      if(share) openShare(uri);
      else feedback("تم حفظ الصورة في المعرض ضمن Pictures/Hasibat-AlLira.",false);
    } catch(Exception e) {
      feedback("تعذر حفظ الصورة؛ تحقق من مساحة التخزين وحاول مجددًا.",true);
    }
  }
  @Override protected void onActivityResult(int request,int result,Intent intent) {
    if(request!=REQUEST_DOCUMENT) { super.onActivityResult(request,result,intent); return; }
    byte[] data; boolean share;
    synchronized(this){data=pendingImage;pendingImage=null;share=pendingShare;}
    if(result!=Activity.RESULT_OK || intent==null || intent.getData()==null || data==null){
      feedback("أُلغيت عملية حفظ الصورة.",false);return;
    }
    try {
      Uri uri=intent.getData();
      ContentResolver resolver=getContentResolver();
      OutputStream out=resolver.openOutputStream(uri,"w");
      if(out==null)throw new IOException("No output stream");
      try{out.write(data);out.flush();}finally{out.close();}
      if(share)openShare(uri);
      else feedback("تم حفظ الصورة في الموقع الذي اخترته.",false);
    }catch(Exception e){feedback("تعذر كتابة الصورة في الملف المحدد.",true);}
  }
  private Uri saveToGallery(byte[] data,String filename) throws IOException {
    ContentResolver resolver=getContentResolver();
    ContentValues values=new ContentValues();
    values.put(MediaStore.Images.Media.DISPLAY_NAME,filename);
    values.put(MediaStore.Images.Media.MIME_TYPE,"image/png");
    values.put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/Hasibat-AlLira");
    values.put(MediaStore.Images.Media.IS_PENDING,1);
    Uri uri=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
    if(uri==null)throw new IOException("Image insert refused");
    try{
      OutputStream out=resolver.openOutputStream(uri,"w");
      if(out==null)throw new IOException("No gallery output stream");
      try{out.write(data);out.flush();}finally{out.close();}
      ContentValues done=new ContentValues();
      done.put(MediaStore.Images.Media.IS_PENDING,0);
      resolver.update(uri,done,null,null);
      return uri;
    }catch(Exception e){
      try{resolver.delete(uri,null,null);}catch(Exception ignored){}
      if(e instanceof IOException)throw (IOException)e;
      throw new IOException("Saving failed",e);
    }
  }
  private void openShare(final Uri uri){
    runOnUiThread(new Runnable(){@Override public void run(){
      try{
        Intent i=new Intent(Intent.ACTION_SEND);
        i.setType("image/png");
        i.putExtra(Intent.EXTRA_STREAM,uri);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i,"مشاركة نتائج حاسبة الليرة"));
        feedback("فُتحت خيارات مشاركة الصورة.",false);
      }catch(Exception e){feedback("تم حفظ الصورة، لكن تعذر فتح قائمة المشاركة.",true);}
    }});
  }
  private void feedback(final String message,final boolean isError){
    runOnUiThread(new Runnable(){@Override public void run(){
      if(resultsWeb!=null)resultsWeb.evaluateJavascript(
        "if(window.onShareResultStatus)window.onShareResultStatus("+
        JSONObject.quote(message)+","+(isError?"true":"false")+");",null);
    }});
  }
  private static byte[] decode(String url) throws IOException{
    if(url==null || !url.startsWith(PREFIX) || url.length()>11200000)
      throw new IOException("Invalid data URL");
    byte[] b;
    try{b=Base64.decode(url.substring(PREFIX.length()),Base64.DEFAULT);}
    catch(Exception e){throw new IOException("Invalid base64",e);}
    if(b.length<512 || b.length>8*1024*1024)throw new IOException("Invalid image length");
    byte[] sig=new byte[]{(byte)137,80,78,71,13,10,26,10};
    for(int i=0;i<8;i++)if(b[i]!=sig[i])throw new IOException("PNG signature invalid");
    int w=read32(b,16),h=read32(b,20);
    if(w<400 || h<600 || w>5000 || h>12000 || ((long)w)*h>40000000L)
      throw new IOException("PNG dimensions invalid");
    return b;
  }
  private static int read32(byte[] b,int i){
    return (b[i]&255)<<24 | (b[i+1]&255)<<16 | (b[i+2]&255)<<8 | b[i+3]&255;
  }
  private static String cleanName(String name){
    String n=name==null?"":name.replaceAll("[^A-Za-z0-9_.-]","_");
    if(n.length()>90)n=n.substring(0,90);
    if(n.isEmpty()||n.equals(".png"))n="Hasibat-AlLira-Results.png";
    if(!n.endsWith(".png"))n=n+".png";
    return n;
  }
}
