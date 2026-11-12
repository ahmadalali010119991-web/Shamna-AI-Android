'use strict';
/**
 * FINAL Telegram transport-side link repair. Install before other wrappers, so
 * this runs last and sees the exact caption/text submitted to the Telegram API.
 * Never invent a source URL from similar topics or link to a search result.
 */
const FEEDS=[
 'https://midan-al-khabar.vercel.app/api/news',
 'https://midan-al-khabar.vercel.app/api/citizen?voices=public'
];
const SOURCE_WORDS=['المنشور الأصلي','المصدر'];
let feedCache={at:0,articles:[]};
const safeUrl=raw=>{try{let u=new URL(String(raw||'').replace(/&amp;/g,'&'));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.includes('.')?u.href:null}catch{return null}};
function visible(raw){
 return String(raw||'').replace(/<[^>]+>/g,' ').replace(/&(?:amp|quot|lt|gt|nbsp);/g,' ')
 .normalize('NFKC').replace(/[\u064b-\u065f\u200e\u200f\u0640]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
}
function sourceFromEntities(txt,body,key){
 const list=body[key==='text'?'entities':'caption_entities'];
 if(!Array.isArray(list))return null;
 for(const x of list){if(x?.type!=='text_link'||!safeUrl(x.url))continue;
  const label=txt.slice(x.offset,x.offset+x.length).replace(/\s+/g,' ').trim();
  if(SOURCE_WORDS.includes(label))return safeUrl(x.url);
 }
 return null;
}
function sourceFromHtml(msg){
 for(const m of String(msg).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  let label=m[2].replace(/<[^>]*>/g,'').trim();if(SOURCE_WORDS.includes(label)&&safeUrl(m[1]))return safeUrl(m[1]);
 }
 return null;
}
function sourceFromVisibleUrl(s){
 for(const m of String(s).matchAll(/https:\/\/[^\s<>"']+/g)){
  const u=safeUrl(m[0].replace(/[.,،؛]+$/,''));
  if(u&&!/(^|\.)instagram\.com$|(^|\.)tiktok\.com$/i.test(new URL(u).hostname))return u;
 }
 return null;
}
async function articles(rawFetch){
 if(Date.now()-feedCache.at<120000&&feedCache.articles.length)return feedCache.articles;
 let result=[];
 for(const url of FEEDS){
  try{const r=await rawFetch(url,{headers:{accept:'application/json','user-agent':'MidanSourceEntityGuard/1'},signal:AbortSignal.timeout(9000)});
   if(!r.ok)continue;
   const v=await r.json();result.push(...(Array.isArray(v.articles)?v.articles:[]),...(Array.isArray(v.items)?v.items:[]));
  }catch{}
 }
 result=result.filter(x=>safeUrl(x.url||x.sourceUrl)&&String(x.title||'').length>=12)
  .map(x=>({title:visible(x.title),url:safeUrl(x.url||x.sourceUrl),id:x.id,source:x.source}));
 feedCache={at:Date.now(),articles:result};return result;
}
async function determineSource(text,body,key,rawFetch){
 return sourceFromEntities(text,body,key)||sourceFromHtml(text)||sourceFromVisibleUrl(text)||
  await (async()=>{
   const content=visible(text);
   if(content.length<25)return null;
   const found=(await articles(rawFetch)).filter(a=>a.title.length>=24&&content.includes(a.title));
   if(found.length===1)return found[0].url;
   // Accept multiple matches only if every exact title match points to the same URL.
   if(found.length>1&&found.every(a=>a.url===found[0].url))return found[0].url;
   return null;
  })();
}
function linksInText(text,parseMode){
 const html=parseMode==='HTML';
 const existing=[];
 if(html){
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of text.matchAll(re)){if(SOURCE_WORDS.includes(m[2].replace(/<[^>]*>/g,'').trim()))existing.push(m[2].replace(/<[^>]*>/g,'').trim())}
 }else for(const w of SOURCE_WORDS)if(text.includes(w))existing.push(w);
 return existing;
}
function repairBody(body,kind,originalUrl){
 if(!body||typeof body!=='object'||!originalUrl)return body;
 const key=typeof body.text==='string'?'text':typeof body.caption==='string'?'caption':null;
 if(!key)return body;
 const text=body[key],mode=body.parse_mode||null,url=safeUrl(originalUrl);
 if(!url)return body;
 let changed=false,nextText=text,nextEntities=null;
 if(mode==='HTML'){
  const escaped=url.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  // Do not re-wrap existing anchors. Match standalone labels only.
  const tokens=String(text).split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);
  for(let i=0;i<tokens.length;i++)if(!/^<a\b/i.test(tokens[i])){
    let val=tokens[i];
    for(const word of SOURCE_WORDS){
      // Word boundary using Arabic text context; only labels next to 🔗 or their own line.
      const re=word==='المصدر'?/(🔗\s*)(المصدر)(?=\s|<|$)/gu:/(🔗\s*)(المنشور الأصلي)(?=\s|<|$)/gu;
      val=val.replace(re,(all,prefix,label)=>{changed=true;return prefix+'<a href="'+escaped+'">'+label+'</a>'});
    }
    tokens[i]=val;
  }
  if(changed)nextText=tokens.join('');
 }else if(!mode){
  const entityKey=key==='text'?'entities':'caption_entities';
  let entities=Array.isArray(body[entityKey])?body[entityKey].map(x=>({...x})):[];
  for(const word of SOURCE_WORDS){
    // Prefer the explicit label "🔗 المصدر" or "🔗 المنشور الأصلي".
    const re=new RegExp('🔗\\s*('+word+')','gu');
    for(const m of text.matchAll(re)){
      const offset=m.index+m[0].lastIndexOf(word);
      if(entities.some(x=>x.offset<=offset&&x.offset+x.length>=offset+word.length))continue;
      entities.push({type:'text_link',offset,length:word.length,url});changed=true;
    }
  }
  if(changed)nextEntities=entities.sort((a,b)=>a.offset-b.offset);
 }
 if(!changed)return body;
 const copy={...body,[key]:nextText};
 if(nextEntities)copy[key==='text'?'entities':'caption_entities']=nextEntities;
 return copy;
}
function install(){
 if(globalThis.__MIDAN_FINAL_SOURCE_GUARD)return;
 globalThis.__MIDAN_FINAL_SOURCE_GUARD=true;
 const original=globalThis.fetch;
 globalThis.fetch=async function(input,init){
  const u=typeof input==='string'?input:input?.url;
  if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/(?:sendMessage|sendPhoto|sendVideo|sendAnimation|sendDocument|editMessageText|editMessageCaption)(?:\?.*)?$/i.test(String(u||''))||!init?.body)return original.apply(this,arguments);
  try{
   const isJson=typeof init.body==='string';
   const data=isJson?JSON.parse(init.body):init.body instanceof FormData?Object.fromEntries([...init.body.entries()].filter(([k,v])=>typeof v==='string')):null;
   if(!data)return original.apply(this,arguments);
   const key=typeof data.text==='string'?'text':typeof data.caption==='string'?'caption':null;
   if(!key||!linksInText(data[key],data.parse_mode).length)return original.apply(this,arguments);
   if(typeof data.entities==='string')try{data.entities=JSON.parse(data.entities)}catch{}
   if(typeof data.caption_entities==='string')try{data.caption_entities=JSON.parse(data.caption_entities)}catch{}
   const source=await determineSource(data[key],data,key,original);
   if(!source){console.warn('Midan source link: verified original not found; preserving message');return original.apply(this,arguments)}
   const fixed=repairBody(data,'',source);
   if(fixed===data)return original.apply(this,arguments);
   if(isJson)return original.call(this,input,{...init,body:JSON.stringify(fixed)});
   const newForm=new FormData();for(const [k,v] of init.body.entries())newForm.append(k,v);
   for(const k of [key,key==='text'?'entities':'caption_entities'])
     if(fixed[k]!==undefined)newForm.set(k,typeof fixed[k]==='object'?JSON.stringify(fixed[k]):fixed[k]);
   return original.call(this,input,{...init,body:newForm});
  }catch(e){console.warn('Midan source link guard failed safely:',String(e.message).slice(0,100));return original.apply(this,arguments)}
 };
}
module.exports={install,repairBody,determineSource,visible,safeUrl};
