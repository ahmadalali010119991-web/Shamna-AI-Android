'use strict';
/** Strip redundant generic "متداول" footer only for explicitly attributed voices. */
const SOURCES=Object.freeze([
  'عهد الصليبي','صهيب الجابر','زين العابدين العكيدي',
  'صهيب اليعربي','أمجد الساري','إبراهيم الحبش'
]);
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function attributedName(text){
  const s=String(text||'');
  for(const name of SOURCES){
    const n=escapeRe(name);
    // Only source metadata counts. A name in an article's body is insufficient.
    const re=new RegExp('(?:^|\\n)\\s*(?:المصدر|الناشط|بقلم|قناة|ناقل الخبر)\\s*[:：–\\-]?\\s*'+n+'(?=\\s|$|[،.|])','mu');
    if(re.test(s))return name;
  }
  return null;
}
function clean(text){
  if(typeof text!=='string'||!attributedName(text))return text;
  // Only a terminal standalone circulation tag, never quotes or article text.
  return text.replace(/(?:\r?\n)\s*(?:الوسم\s*[:：]\s*)?#?متداول\s*$/u,'').trimEnd();
}
function install(){
  if(globalThis.__MIDAN_TRUSTED_VOICES_INSTALLED)return;
  globalThis.__MIDAN_TRUSTED_VOICES_INSTALLED=true;
  const prior=globalThis.fetch;
  globalThis.fetch=function(input,init){
    const url=typeof input==='string'?input:input?.url;
    if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?.*)?$/i.test(String(url||''))||
       !init?.body||typeof init.body!=='string')return prior.apply(this,arguments);
    let body;
    try{body=JSON.parse(init.body)}catch{return prior.apply(this,arguments)}
    if(typeof body?.text!=='string')return prior.apply(this,arguments);
    const changed=clean(body.text);
    if(changed===body.text)return prior.apply(this,arguments);
    return prior.call(this,input,{...init,body:JSON.stringify({...body,text:changed})});
  };
}
module.exports={SOURCES,attributedName,clean,install};
