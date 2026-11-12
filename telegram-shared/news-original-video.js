'use strict';
/**
 * Midan native-video Telegram publisher. Zero disk/object-storage writes.
 * Only outgoing attributed news sendMessage requests are considered.
 * Original news and publisher state remain the source of truth.
 */
const photo=require('./news-original-photo');
const nativeFetch=globalThis.fetch;
const MAX_PAGE=1500000,MAX_VIDEO=46*1024*1024,MAX_REMOTE_VIDEO=20*1024*1024;
const BASE_TIMEOUT=13000,VIDEO_TIMEOUT=40000;
const sourceLink=photo.sourceLink;
function publicUrl(raw,base){
  try{
    const u=new URL(raw,base),host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||!/^[a-z0-9.-]+$/.test(host)||
      !host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes('..')||host.endsWith('.test'))return null;
    return u.href;
  }catch{return null}
}
function dec(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;|&apos;/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function attrs(s){const r={};for(const m of String(s).matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))r[m[1].toLowerCase()]=dec(m[3]);return r}
function videoCandidates(html,base){
  const result=[],add=x=>{const url=publicUrl(dec(x),base);if(url&&!result.includes(url))result.push(url)};
  for(const m of String(html).matchAll(/<meta\b[^>]*>/gi)){
    const x=attrs(m[0]),key=(x.property||x.name||x.itemprop||'').toLowerCase();
    if(['og:video','og:video:url','og:video:secure_url','twitter:player:stream','video','contenturl'].includes(key))add(x.content);
  }
  for(const m of String(html).matchAll(/<(?:video|source)\b[^>]*>/gi)){const x=attrs(m[0]);add(x.src)}
  for(const m of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const root=JSON.parse(m[1]),stack=Array.isArray(root)?root:[root];
      while(stack.length){
        const item=stack.pop();if(!item||typeof item!=='object')continue;
        if(Array.isArray(item)){stack.push(...item);continue}
        if(String(item['@type']||'').includes('VideoObject')){add(item.contentUrl);if(item.embedUrl&&/\.(?:mp4|mov)(?:[?#]|$)/i.test(item.embedUrl))add(item.embedUrl)}
        if(item['@graph'])stack.push(item['@graph']);
        if(item.video)stack.push(item.video);
        if(item.associatedMedia)stack.push(item.associatedMedia);
      }
    }catch{}
  }
  // A public Telegram video widget sometimes provides an HTML5 source.
  if(/(?:^|\.)t\.me$|(?:^|\.)telegram\.me$/.test(new URL(base).hostname)){
    for(const m of String(html).matchAll(/<(?:video|source)\b[^>]*?src=(["'])([^"']+)\1/gi))add(m[2]);
  }
  return result;
}
async function bounded(url,{maxBytes=MAX_PAGE,timeout=BASE_TIMEOUT,accept='text/html,application/xhtml+xml',mode='buffer'}={}){
  let target=publicUrl(url);if(!target)throw Error('Unsafe media source');
  for(let redirect=0;redirect<4;redirect++){
    const res=await nativeFetch(target,{redirect:'manual',cache:'no-store',
      headers:{'accept':accept,'user-agent':'MidanAlKhabarBot/5.0 (public news media)'},
      signal:AbortSignal.timeout(timeout)});
    if([301,302,303,307,308].includes(res.status)){
      const next=res.headers.get('location');target=publicUrl(next,target);
      if(!target)throw Error('Unsafe media redirect');continue;
    }
    if(!res.ok)throw Error('Source HTTP '+res.status);
    const contentLength=Number(res.headers.get('content-length')||0);
    if(contentLength>maxBytes)throw Error('Media is larger than upload limit');
    if(mode==='headers'){try{await res.body?.cancel()}catch{};return {url:target,type:res.headers.get('content-type')||'',size:contentLength}}
    if(!res.body)throw Error('No response stream');
    const chunks=[];let size=0;
    for await(const piece of res.body){size+=piece.length;if(size>maxBytes)throw Error('Media exceeds streaming limit');chunks.push(Buffer.from(piece))}
    return {url:target,type:res.headers.get('content-type')||'',size,buffer:Buffer.concat(chunks)};
  }
  throw Error('Media redirects exceeded');
}
function isPlayable(buf,ctype,url){
  const sig=buf.subarray(4,12).toString('latin1');
  return buf.length>128&&
    (/(?:^|\b)video\/mp4/i.test(ctype)||/\.mp4(?:[?#]|$)/i.test(url))&&
    /ftyp/.test(sig);
}
function caption(text){
  const trimmed=String(text||'').trim();
  if([...trimmed].length<=950)return {caption:trimmed,remaining:''};
  const all=[...trimmed],head=all.slice(0,850).join('').trimEnd()+'…';
  return {caption:head+'\n\nالتفاصيل الكاملة في الرسالة التالية',remaining:all.join('')};
}
function videoTarget(body,url,form){
  const parsed=JSON.parse(JSON.stringify(body));
  delete parsed.text;delete parsed.entities;delete parsed.link_preview_options;delete parsed.parse_mode;
  for(const k of ['chat_id','message_thread_id','reply_to_message_id','disable_notification','protect_content','reply_markup']){
    if(parsed[k]===undefined||parsed[k]===null)continue;
    form.append(k,typeof parsed[k]==='object'?JSON.stringify(parsed[k]):String(parsed[k]));
  }
  form.append('supports_streaming','true');
  return String(url).replace(/\/sendMessage(\?.*)?$/i,'/sendVideo$1');
}
function attachCaption(form,fullText){
  const result=caption(fullText);
  form.append('caption',result.caption);
  return result;
}
function installed(){
  if(globalThis.__MIDAN_ORIGINAL_VIDEO_INSTALLED)return;
  globalThis.__MIDAN_ORIGINAL_VIDEO_INSTALLED=true;
  const prior=globalThis.fetch;
  globalThis.fetch=async function(input,init){
    const u=typeof input==='string'?input:input?.url;
    if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?.*)?$/i.test(String(u||''))||
      typeof init?.body!=='string')return prior.apply(this,arguments);
    let body;try{body=JSON.parse(init.body)}catch{return prior.apply(this,arguments)}
    if(!body||typeof body.text!=='string'||!body.chat_id)return prior.apply(this,arguments);
    const origin=sourceLink(body);if(!origin)return prior.apply(this,arguments);
    let media,videoUrl;
    try{
      const page=await bounded(origin);
      if(!/text\/html|application\/xhtml/i.test(page.type))return prior.apply(this,arguments);
      const videos=videoCandidates(page.buffer.toString('utf8'),page.url);
      if(!videos.length)return prior.apply(this,arguments);
      for(const candidate of videos.slice(0,3)){
        // Upload only actual MP4. External embedded players are not direct video files.
        if(!/\.mp4(?:[?#]|$)/i.test(candidate))continue;
        try{
          const response=await bounded(candidate,{maxBytes:MAX_VIDEO,timeout:VIDEO_TIMEOUT,accept:'video/mp4,video/*'});
          if(isPlayable(response.buffer,response.type,response.url)){videoUrl=response.url;media=response;break}
        }catch(e){console.warn('Video source unavailable:',String(e.message).slice(0,110))}
      }
    }catch(e){console.warn('Video detection unavailable:',String(e.message).slice(0,110));return prior.apply(this,arguments)}
    if(!media)return prior.apply(this,arguments);
    let published=false;
    try{
      const form=new FormData();
      const out=attachCaption(form,body.text);
      const url=videoTarget(body,u,form);
      form.append('video',new Blob([media.buffer],{type:'video/mp4'}),'midan-original-video.mp4');
      const response=await prior.call(this,url,{method:'POST',body:form,signal:AbortSignal.timeout(VIDEO_TIMEOUT+25000)});
      // Preserve the real Telegram API reply for the caller, even if it is a 400/429.
      const packet=await response.clone().json().catch(()=>null);
      if(!response.ok||packet?.ok!==true){console.warn('Telegram native video upload failed:',response.status);return response}
      published=true;
      if(out.remaining){
        // Telegram caption has a strict limit. Publish full news in a threaded follow-up.
        // The original sendVideo already succeeded; avoid throwing and duplicating the video.
        const messageId=packet.result?.message_id;
        if(Number.isSafeInteger(messageId)){
          const next=String(u);
          const full={chat_id:body.chat_id,reply_to_message_id:messageId,text:out.remaining};
          await prior.call(this,next,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(full),signal:AbortSignal.timeout(15000)}).catch(e=>console.warn('Full video text follow-up failed:',String(e.message).slice(0,120)));
        }
      }
      console.info('Midan video published natively', {messageId:packet.result?.message_id,bytes:media.size});
      return response;
    }catch(e){if(published)throw e;console.warn('Video publishing transport failed; retry publisher queue:',String(e.message).slice(0,150));throw e}
    finally{if(media){media.buffer=null;media=null}}
  };
}
module.exports={install:installed,videoCandidates,caption,isPlayable,publicUrl,bounded};
