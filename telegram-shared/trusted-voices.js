'use strict';
const SOURCES=Object.freeze(['عهد الصليبي','صهيب الجابر','زين العابدين العكيدي','صهيب اليعربي','أمجد الساري','إبراهيم الحبش']);
function attributedName(text){
 const s=String(text||'').normalize('NFKC');
 return SOURCES.find(n=>s.includes(n)&&/(المصدر|الناشط|بقلم|قناة|ناقل الخبر)/u.test(s))||null;
}
function clean(text){
 if(typeof text!=='string'||!attributedName(text))return text;
 return text
  .replace(/[ \t]*📌[ \t]*#?متداول(?=\s|$|[🔗#📍✍️،.])/gu,'')
  .replace(/(^|\n)[ \t]*(?:الوسم[ \t]*[:：][ \t]*)?#?متداول[ \t]*(?=\n|$)/gmu,'$1')
  .replace(/[ \t]{2,}/g,' ')
  .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trimEnd();
}
function install(){
 if(globalThis.__MIDAN_TRUSTED_VOICES_INSTALLED)return;
 globalThis.__MIDAN_TRUSTED_VOICES_INSTALLED=true;
 const prior=globalThis.fetch;
 globalThis.fetch=function(input,init){
  const url=typeof input==='string'?input:input?.url;
  if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/(?:sendMessage|sendPhoto|sendVideo|sendAnimation|sendDocument|editMessageText|editMessageCaption|editMessageMedia)(?:\?.*)?$/i.test(String(url||''))||!init?.body)return prior.apply(this,arguments);
  const body=init.body;
  if(typeof body==='string'){
   let payload;try{payload=JSON.parse(body)}catch{return prior.apply(this,arguments)}
   let updated=false;
   for(const key of ['text','caption'])if(typeof payload?.[key]==='string'){
     let next=clean(payload[key]);if(next!==payload[key]){payload[key]=next;updated=true}
   }
   if(payload?.media&&typeof payload.media.caption==='string'){
     const next=clean(payload.media.caption);if(next!==payload.media.caption){payload.media.caption=next;updated=true}
   }
   return updated?prior.call(this,input,{...init,body:JSON.stringify(payload)}):prior.apply(this,arguments);
  }
  if(body instanceof FormData){
   let updated=false,copy=new FormData();
   for(const [key,value] of body.entries()){
    let next=value;
    if(['text','caption'].includes(key)&&typeof value==='string'){next=clean(value);updated||=next!==value}
    if(key==='media'&&typeof value==='string')try{
      const m=JSON.parse(value);if(typeof m.caption==='string'){const cleaned=clean(m.caption);if(cleaned!==m.caption){m.caption=cleaned;next=JSON.stringify(m);updated=true}}
    }catch{}
    copy.append(key,next);
   }
   return updated?prior.call(this,input,{...init,body:copy}):prior.apply(this,arguments);
  }
  return prior.apply(this,arguments);
 };
}
module.exports={SOURCES,attributedName,clean,install};
