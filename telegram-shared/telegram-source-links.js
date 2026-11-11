'use strict';
/**
 * Format only the news SOURCE link appearing as a bare URL in Telegram
 * captions/messages. Never change the destination URL, the article content,
 * or unrelated social/advertisement links. Works with JSON and multipart
 * Bot API payloads. Uses Telegram's native text_link entities for plain text,
 * and <a> anchors for existing HTML messages.
 */
const BOT_PATH=/^https:\/\/api\.telegram\.org\/bot[^/]+\/(sendMessage|sendPhoto)$/i;
const SOURCE_LINE=/(🔗\s*|(?:^|\n)\s*(?:المصدر(?:\s+الأصلي)?|رابط\s+الخبر|المصدر\s+الرئيسي)\s*[:：]?\s*)(https?:\/\/[^\s<>"']+)/gu;
function sourceUrl(raw){
 try{
  const u=new URL(raw.replace(/[،؛.؟!)}\]]+$/u,''));
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||
    u.hostname==='localhost'||u.hostname.endsWith('.local')||
    /^(?:127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname))return null;
  return u.href;
 }catch{return null}
}
function htmlAttr(v){return v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function transformString(value,mode){
 if(typeof value!=='string'||value.length===0)return null;
 const candidates=[...value.matchAll(SOURCE_LINE)];
 // Only format the FINAL displayed source link; earlier links may have
 // independent meaning. The source indicator must remain visible.
 const match=candidates.at(-1);
 if(!match)return null;
 const url=sourceUrl(match[2]);
 if(!url)return null;
 const prefix=match[1];
 const mStart=match.index;
 const urlStart=mStart+prefix.length;
 const urlEnd=urlStart+match[2].length;
 const rest=value.slice(urlEnd);
 const canRewrite=rest.trim().length<500&&!/https?:\/\/\S+/u.test(rest);
 if(!canRewrite)return null;
 if(mode&&String(mode).toLowerCase().startsWith('markdown')){
  // Preserve Markdown layouts rather than risk double parsing.
  return null;
 }
 const cleanPrefix=/المصدر/u.test(prefix)?prefix.replace(/(?:المصدر(?:\s+الأصلي)?|رابط\s+الخبر)\s*[:：]?\s*/gu,''):prefix;
 const label='المصدر';
 if(mode&&String(mode).toUpperCase()==='HTML'){
  const replacement=cleanPrefix+'<a href="'+htmlAttr(url)+'">'+label+'</a>';
  return {value:value.slice(0,mStart)+replacement+rest,url,kind:'html'};
 }
 const replacement=cleanPrefix+label;
 const next=value.slice(0,mStart)+replacement+rest;
 const labelStart=mStart+cleanPrefix.length;
 return {value:next,url,kind:'entity',offset:labelStart,length:label.length,
   delta:next.length-value.length,originalEnd:urlEnd};
}
function transformPayload(payload){
 if(!payload||typeof payload!=='object')return false;
 const field=typeof payload.caption==='string'?'caption':typeof payload.text==='string'?'text':null;
 if(!field)return false;
 const mode=payload.parse_mode||'';
 const out=transformString(payload[field],mode);
 if(!out)return false;
 const entityField=field==='caption'?'caption_entities':'entities';
 const existing=Array.isArray(payload[entityField])?payload[entityField]:[];
 if(out.kind==='entity'){
  // Existing entities later than the source link are adjusted safely.
  // If the removed URL overlaps an existing entity, leave the post alone.
  const priorEnd=out.originalEnd;
  const oldLen=payload[field].length,newLen=out.value.length;
  const replacementStart=out.offset;
  const oldStart=priorEnd-(oldLen-newLen+out.length);
  const fixed=[];
  for(const e of existing){
   const start=e.offset,end=start+e.length;
   if(end<=oldStart)fixed.push(e);
   else if(start>=priorEnd)fixed.push({...e,offset:start+out.delta});
   else return false;
  }
  fixed.push({type:'text_link',offset:out.offset,length:out.length,url:out.url});
  payload[entityField]=fixed;
  delete payload.parse_mode;
 }
 payload[field]=out.value;
 return true;
}
function interceptRequest(url,init){
 let parsed;
 try{
  const dest=typeof url==='string'?url:url?.url||String(url);
  parsed=new URL(dest);
  if(!BOT_PATH.test(dest)||!['POST','post'].includes(init?.method||'POST'))return null;
 }catch{return null}
 const originalBody=init?.body;
 if(typeof originalBody==='string'){
  let p;
  try{p=JSON.parse(originalBody)}catch{return null}
  if(!transformPayload(p))return null;
  return {...init,body:JSON.stringify(p)};
 }
 if(originalBody&&typeof originalBody.get==='function'&&typeof originalBody.set==='function'){
  const field=originalBody.has('caption')?'caption':originalBody.has('text')?'text':null;
  if(!field)return null;
  const copy=new FormData();
  for(const [k,v] of originalBody)copy.append(k,v);
  const p={ [field]:String(copy.get(field)),parse_mode:copy.get('parse_mode')||undefined};
  const entities=copy.get(field==='caption'?'caption_entities':'entities');
  if(entities){try{p[field==='caption'?'caption_entities':'entities']=JSON.parse(entities)}catch{return null}}
  if(!transformPayload(p))return null;
  copy.set(field,p[field]);
  copy.delete('parse_mode');
  const n=field==='caption'?'caption_entities':'entities';
  if(p.parse_mode)copy.set('parse_mode',p.parse_mode);
  if(Array.isArray(p[n]))copy.set(n,JSON.stringify(p[n]));
  // Let fetch add the correct multipart boundary. Never reuse the old
  // Content-Type boundary after cloning the original FormData.
  const headers=new Headers(init?.headers||{});
  headers.delete('content-type');
  return {...init,body:copy,headers};
 }
 return null;
}
const SHARED=Symbol.for('Midan.Telegram.SourceLinkInterceptor');
async function withSourceLinks(run){
 if(typeof run!=='function')throw TypeError('run must be callable');
 let state=globalThis[SHARED];
 if(!state){
  const original=globalThis.fetch;
  state={original,active:0};
  globalThis[SHARED]=state;
  globalThis.fetch=function telegramSourceLinks(input,init){
   const replaced=interceptRequest(input,init);
   if(!replaced)return original(input,init);
   return original(input,replaced);
  };
 }
 state.active++;
 try{return await run()}
 finally{
  state.active--;
  if(state.active===0){
   globalThis.fetch=state.original;
   delete globalThis[SHARED];
  }
 }
}
module.exports={sourceUrl,transformString,transformPayload,interceptRequest,withSourceLinks};
