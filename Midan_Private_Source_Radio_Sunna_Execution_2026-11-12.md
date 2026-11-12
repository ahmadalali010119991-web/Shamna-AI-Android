# ميدان الخبر + مصدر خاص + حاسبة الليرة — سجل الحالة التنفيذية

**آخر تدقيق:** 12 نوفمبر 2026. الغرض: توثيق ما تم فعله، وما يتطلب خطوة خارجية، دون الادعاء بأن APK موقّع قد صدر.

## ميدان الخبر — إنتاج
- Vercel project: `midan-al-khabar`
- Production deployment: `dpl_H1mVgG3HooaUuD79nxbF9ELSK1Yy` — READY.
- `/api/news` HTTP 200، ويعيد مصدر `private-source99` باسم «مصدر خاص».
- رابط المصدر: https://t.me/Private_Source99
- القناة في آخر فحص تحتوي على رسالة الإنشاء رقم 1 فقط؛ وعدد الأخبار الفعلية من المصدر في الإنتاج صفر.
- تم تجهيز استخراج الأخبار من صفحة القناة العامة (بما فيها الرسائل النصية والصور والفيديوهات)، مع رابط `https://t.me/Private_Source99/{message_id}`، ومنع تكرار الرسائل بالمعرف.
- لا يوجد نشر تجريبي فعلي من هذه القناة بعد؛ إثبات التقاط خبر جديد يتطلب نشر خبر في المصدر ومقارنته بالموقع والقناة.
- اختبار العقد الآلي: https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43298973906 — SUCCESS.
- لم يُبنَ APK جديد لميدان الخبر.

## بوت ميدان الخبر — إنتاج
- Vercel project: `dallalna-telegram-bridge`.
- Restored stable deployment `dpl_4TwhBiFLiaPuTQP8tMj894zeMkcG` — READY.
- `/api/health` HTTP 200 `configured:true` في الفحص الأخير.
- `lib/source-links-final.js` منشور؛ استعادة الرابطين «المصدر» و«المنشور الأصلي» عند توافر تطابق وحيد دقيق مع المصدر.
- إصلاح الأرشيف: GitHub Actions run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43292631256 — SUCCESS.
- التحقق من روابط منشورات قديمة محددة تم في المسار السابق؛ تجنب ربط خبر بعنوان مشابه دون تطابق موثوق.
- اختبار صلاحيات عضوية البوت في القناة الخاصة لم يكتمل؛ وبما أن القناة عامة تُقرأ أخبارها من الويب فلا يعتمد جلبها على عضوية البوت فيها. لا حاجة لنشر اختبار بلا إذن.

## حاسبة الليرة — إذاعة السنة
- التطبيق الحالي: `com.syrianlira.calculator`، `v1.8.24`، `versionCode 37`.
- APK الأصلي SHA256: `d25fd6312a01aae5789dd60d9b1e6b873b82e178fcafa324ff0c458b77aefdbe`.
- رابط إذاعة السنة: `https://radiosunna.radioca.st/stream`، اختبر سابقًا ورجع `audio/mpeg`.
- أُنشئ سكربت المورد فقط: `tools/hasibat/patch_radio_sunna_v1825.py`.
- GitHub Action https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43298328974 — SUCCESS.
- Artifact: `Hasibat-1.8.25-Radio-Sunna-Asset-Only-NOT-APK`؛ يحتوي على `assets/index.html` المعدل فقط، وليس تطبيق Android.
- **لم يُوقّع إصدار APK جديد.** تحديث التطبيق المثبت يتطلب مفتاح التوقيع الأصلي المحفوظ في الاستعادة المشفرة، مع كلمة فتحه خارج GitHub/Vercel، ثم التحقق باستخدام `apksigner` وتثبيت فوق 1.8.24. لا ترفع كلمة مرور التوقيع أو المفتاح إلى الملفات العامة أو المحادثات.
- لا يجوز نشر APK غير موقّع أو بتوقيع مختلف بوصفه تحديثًا.
