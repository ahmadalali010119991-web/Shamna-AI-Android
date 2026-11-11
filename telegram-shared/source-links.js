'use strict';
// Non-invasive Telegram outgoing-message normalization. Keeps the original
// source URL in an HTML text-link instead of displaying a 500-character slug.
// This is installed only on bot API entrypoints; other fetches pass unchanged.
const nativeFetch=globalThis.fetch;
const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function rewriteBodyText(input,parseMode){
  if(typeof input!=='string'||input.includes('>المصدر</a>'))return {text:input,changed:false};
  // A visible standalone source URL, as posted by the existing news pipeline.
  // A real URL is never shortened, modified, or discarded.
  const re=/(^|\n)([\t ]*(?:🔗\s*|المصدر(?:\s+الأصلي)?\s*[:：]\s*))(https:\/\/[^\s<>]+)(?=\s*(?:\n|$))/gmu;
  let match,selected=null;
  while((match=re.exec(input))){
    try{
      const url=new URL(match[3].replace(/&amp;/g,'&'));
      if(url.protocol!=='https:'||url.username||url.password||url.port)continue;
      if(!url.hostname||url.hostname==='localhost'||url.hostname.endsWith('.local'))continue;
      selected={start:match.index+match[1].length,end:re.lastIndex,url:url.toString()};
    }catch{}
  }
  if(!selected)return {text:input,changed:false};
  if(parseMode&&parseMode!=='HTML')return {text:input,changed:false};
  if(parseMode==='HTML'){
    const link='<a href="'+esc(selected.url)+'">المصدر</a>';
    return {text:input.slice(0,selected.start)+'🔗 '+link+input.slice(selected.end),changed:true};
  }
  // Without a parse mode, use the API's UTF-16 entity offsets. No changes
  // to the rest of the plain text, and no HTML interpretation is introduced.
  const prefix=input.slice(0,selected.start)+'🔗 ';
  return {text:prefix+'المصدر'+input.slice(selected.end),
    changed:true,entity:{type:'text_link',offset:prefix.length,length:'المصدر'.length,url:selected.url}};
}
function rewritePayload(body){
  if(!body||typeof body!=='object')return body;
  const k=typeof body.text==='string'?'text':typeof body.caption==='string'?'caption':null;
  if(!k)return body;
  const result=rewriteBodyText(body[k],body.parse_mode);
  if(!result.changed)return body;
  if(result.entity&&Array.isArray(body.entities)&&body.entities.length)return body;
  if(result.entity&&Array.isArray(body.caption_entities)&&body.caption_entities.length)return body;
  const copy={...body,[k]:result.text};
  if(result.entity)copy[k==='caption'?'caption_entities':'entities']=[result.entity];
  return copy;
}
function install(){
  if(globalThis.__MIDAN_SOURCE_LINKS_INSTALLED)return;
  globalThis.__MIDAN_SOURCE_LINKS_INSTALLED=true;
  const original=globalThis.fetch;
  globalThis.fetch=function(input,init){
    try{
      const url=typeof input==='string'?input:input?.url;
      if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/send(?:Message|Photo|Video|Animation)(?:\?.*)?$/i.test(String(url||''))||!init?.body)return original.apply(this,arguments);
      const isJson=typeof init.body==='string' && /application\/json/i.test(String(new Headers(init.headers).get('content-type')||''));
      if(isJson){
        const before=JSON.parse(init.body);
        const after=rewritePayload(before);
        if(after!==before)return original.call(this,input,{...init,body:JSON.stringify(after)});
      }else if(init.body instanceof FormData){
        const payload={caption:init.body.get('caption'),parse_mode:init.body.get('parse_mode')};
        const update=rewritePayload(payload);
        if(update!==payload){
          const form=new FormData();
          for(const [k,v] of init.body.entries())form.append(k,v);
          form.set('caption',update.caption);
          if(update.caption_entities)form.set('caption_entities',JSON.stringify(update.caption_entities));
          return original.call(this,input,{...init,body:form});
        }
      }
    }catch(err){console.warn('News source display normalization skipped:',String(err.message).slice(0,100))}
    return original.apply(this,arguments);
  };
}
module.exports={install,rewriteBodyText,rewritePayload};
