/* Preserve original mobile bugfixes and restore official compatible APK links. */
(()=>{'use strict';
 const load=document.createElement('script');load.src='/app-inner.js';load.async=false;
 const about=document.getElementById('aboutView');
 const protect=()=>{
  if(!about)return;
  for(const a of about.querySelectorAll('a[href]')){
   const href=a.getAttribute('href')||'';
   if(href.includes('/api/news?artifact=midan')||href.includes('/api/download?app=midan')){
     a.setAttribute('href','/api/apk');
     a.setAttribute('download','Midan-AlKhabar-original-1.0.0.apk');
   }else if(href.includes('/api/news?artifact=lira')||href.includes('/api/download?app=hasibat')){
     a.setAttribute('href','/api/download?app=hasibat');
     a.setAttribute('download','Hasibat-AlLira-original.apk');
   }
  }
 };
 if(about){new MutationObserver(protect).observe(about,{childList:true,subtree:true});protect()}
 load.onload=protect;
 document.body.append(load);
})();

/* User-initiated Web Push registration — browser/PWA only; Android WebView requires native FCM. */
(function(){
'use strict';
let saveTimer;
const isNative=()=>!!window.AndroidBridge||/;\s*wv\)/i.test(navigator.userAgent||'');
const supported=()=>!!(navigator.serviceWorker&&window.PushManager&&window.Notification);
const b64Key=s=>{const bin=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(bin,c=>c.charCodeAt(0))};
const preferences=p=>({
 urgent:p?.urgent!==false,important:p?.important===true,updates:p?.updates!==false,
 country:String(p?.notifyCountry||'all'),quiet:p?.quiet===true,
 quietFrom:p?.quietFrom||'23:00',quietTo:p?.quietTo||'07:00'
});
async function record(sub,prefs,sendTest=false){
 const response=await fetch('/api/push',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({subscription:sub.toJSON(),prefs:preferences(prefs),test:sendTest===true})});
 if(!response.ok){let e={};try{e=await response.json()}catch{};throw Error(e.error||'فشل تسجيل الاشتراك في خادم الإشعارات')}
 const result=await response.json();
 window.midanBackgroundPush=true;
 const label=document.getElementById('permissionStatus');if(label)label.textContent=result.test?.status==='submitted'?'اشتراك مسجّل • أُرسل إشعار اختبار (يرجى التحقق من وصوله)':result.test?.status==='failed'?'مسجّل • تعذّر إرسال إشعار الاختبار':'مسجّل لدى الخادم (بانتظار اختبار وصول)';
 return result;
}
window.enableBackgroundNewsPush=async function(prefs){
 if(isNative())throw Error('إشعارات نسخة أندرويد تُفعّل عبر التطبيق الأصلي وFirebase');
 if(!supported())throw Error('المتصفح لا يدعم إشعارات الخلفية. جرّب Chrome أو ثبّت الموقع كتطبيق ويب');
 if(Notification.permission==='denied')throw Error('الإشعارات محظورة من إعدادات المتصفح. اسمح بها للموقع أولاً');
 const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(permission!=='granted')throw Error('لم يتم منح إذن إشعارات المتصفح');
 const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
 const configResp=await fetch('/api/push',{cache:'no-store'});
 if(!configResp.ok)throw Error('تعذر الاستعلام عن خدمة الإشعارات');
 const config=await configResp.json();
 if(!config.available||!config.publicKey)throw Error('خدمة إرسال الإشعارات غير مهيأة حاليًا');
 let sub=await reg.pushManager.getSubscription();
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64Key(config.publicKey)});
 const confirmation=await record(sub,prefs,true);
 return confirmation.test?.status==='submitted'?'تم تسجيل الاشتراك وإرسال إشعار اختبار من الخادم. تحقّق من ظهوره على الجهاز.':confirmation.test?.status==='failed'?'تم تسجيل الاشتراك، لكن خدمة إرسال اختبار الإشعارات رفضت الطلب؛ راجع إعدادات المتصفح.':'سُجّل هذا الجهاز لتلقي إشعارات الخلفية، لكن وصولها لم يُختبر بعد.';
};
window.updatePushPreferences=function(prefs){
 if(isNative()||!supported()||Notification.permission!=='granted')return;
 clearTimeout(saveTimer);
 saveTimer=setTimeout(async()=>{try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();if(sub)await record(sub,prefs)}catch(e){console.warn('Midan web push preference sync failed:',e.message||e)}},700);
};
})();
