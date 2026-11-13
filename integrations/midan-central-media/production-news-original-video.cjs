'use strict';
/**
 * Midan native-video Telegram publisher. Zero disk/object-storage writes.
 * Only outgoing attributed news sendMessage requests are considered.
 * Original news and publisher state remain the source of truth.
 */
const photo=require('./news-original-photo');
const nativeFetch=globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch;
const MAX_PAGE=1500000,MAX_VIDEO=46*1024*1024;
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
  // Some public Telegram video widgets use <i> with data-video rather
  // than a native <video> tag. Try these media refs when copyMessage cannot
  // access the original channel.
  if(/^(?:t\.me|www\.t\.me|telegram\.me)$/i.test(new URL(base).hostname)){
    for(const m of String(html).matchAll(/<[^>]{1,1200}>/g)){
      if(!/tgme_widget_message_(?:round)?video\b/i.test(m[0]))continue;
      const x=attrs(m[0]);
      add(x.src);add(x['data-video']);add(x['data-src']);
    }
  }
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
    const mime=String(res.headers.get('content-type')||'').toLowerCase();
    if(accept.startsWith('video/') && !mime.includes('video/mp4') && !mime.includes('application/octet-stream'))throw Error('Not a direct playable MP4');
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
function caption(text,source){
  // Preserve user-visible words, not source-link HTML syntax.
  const full=dec(String(text||'').replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi,'$1')
    .replace(/<[^>]*>/g,'').replace(/(?:^|\n)\s*(?:🔗\s*|المصدر\s*[:：]\s*)https:\/\/[^\s]+\s*$/gmu,'').trim());
  const suffix='\n\n🔗 المصدر';
  // Telegram caption length and entity offsets are UTF-16 based.
  const maxCaption=1024-suffix.length;
  const short=full.length<=maxCaption;
  const prefix=short?full:full.slice(0,Math.min(830,maxCaption-45)).trimEnd()+'…\nالتفاصيل الكاملة في الرد';
  return {caption:prefix+suffix,remaining:short?'':full,sourceOffset:prefix.length+2+3};
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
function attachCaption(form,fullText,origin){
  const result=caption(fullText,origin);
  form.append('caption',result.caption);
  const linkStart=result.caption.lastIndexOf('المصدر');
  form.append('caption_entities',JSON.stringify([{type:'text_link',offset:linkStart,length:'المصدر'.length,url:origin}]));
  return result;
}
function telegramPost(url){
  try{
    const u=new URL(url);if(!['t.me','telegram.me'].includes(u.hostname.toLowerCase()))return null;
    const parts=u.pathname.split('/').filter(Boolean);
    if(parts[0]==='s')parts.shift();
    if(parts.length!==2||!/^[_a-zA-Z0-9]{5,32}$/.test(parts[0])||!/^[1-9]\d{0,12}$/.test(parts[1]))return null;
    return {from_chat_id:'@'+parts[0],message_id:Number(parts[1])};
  }catch{return null}
}
function telegramVideoPresent(html){
  return /tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b|property=["']og:video/iu.test(String(html));
}
async function sendRemainingText(api,chatId,messageId,content){
  if(!content||!Number.isSafeInteger(messageId))return;
  for(let off=0;off<content.length;off+=3800){
    const full={chat_id:chatId,reply_to_message_id:messageId,text:content.slice(off,off+3800)};
    try{
      const reply=await nativeFetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(full),signal:AbortSignal.timeout(15000)});
      if(!reply.ok)console.warn('Video news follow-up rejected:',reply.status);
    }catch(e){console.warn('Full video news follow-up failed:',String(e.message).slice(0,120))}
  }
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
    let media;
    try{
      const page=await bounded(origin);
      if(!/text\/html|application\/xhtml/i.test(page.type))return prior.apply(this,arguments);
      const html=page.buffer.toString('utf8');
      const tg=telegramPost(origin);
      if(tg&&telegramVideoPresent(html)){
        const out=caption(body.text,origin);
        const copyBody={chat_id:body.chat_id,from_chat_id:tg.from_chat_id,message_id:tg.message_id,caption:out.caption,
          caption_entities:[{type:'text_link',offset:out.caption.lastIndexOf('المصدر'),length:'المصدر'.length,url:origin}]};
        if(body.disable_notification!==undefined)copyBody.disable_notification=body.disable_notification;
        if(body.protect_content!==undefined)copyBody.protect_content=body.protect_content;
        const copyUrl=String(u).replace(/\/sendMessage(\?.*)?$/i,'/copyMessage$1');
        try{
          const copyResp=await prior.call(this,copyUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(copyBody),signal:AbortSignal.timeout(16000)});
          const packet=await copyResp.clone().json().catch(()=>null);
          if(copyResp.ok&&packet?.ok===true){
            await sendRemainingText(String(u),body.chat_id,packet.result?.message_id,out.remaining);
            console.info('Midan Telegram-origin video copied natively',{messageId:packet.result?.message_id});
            return copyResp;
          }
          console.warn('Telegram source video cannot be copied:',copyResp.status);
        }catch(e){console.warn('Telegram copyVideo unavailable:',String(e.message).slice(0,110))}
      }
      const videos=videoCandidates(html,page.url);
      if(!videos.length)return prior.apply(this,arguments);
      for(const candidate of videos.slice(0,3)){
        // Try only video candidates advertised by the article itself.
        // Check Content-Type and MP4 signature before accepting opaque CDN URLs.
        try{
          const response=await bounded(candidate,{maxBytes:MAX_VIDEO,timeout:VIDEO_TIMEOUT,accept:'video/mp4,video/*'});
          if(isPlayable(response.buffer,response.type,response.url)){media=response;break}
        }catch(e){console.warn('Video source unavailable:',String(e.message).slice(0,110))}
      }
    }catch(e){console.warn('Video detection unavailable:',String(e.message).slice(0,110));return prior.apply(this,arguments)}
    if(!media)return prior.apply(this,arguments);
    let published=false;
    try{
      const form=new FormData();
      const out=attachCaption(form,body.text,origin);
      const url=videoTarget(body,u,form);
      form.append('video',new Blob([media.buffer],{type:'video/mp4'}),'midan-original-video.mp4');
      const response=await prior.call(this,url,{method:'POST',body:form,signal:AbortSignal.timeout(VIDEO_TIMEOUT+25000)});
      // Preserve the real Telegram API reply for the caller, even if it is a 400/429.
      const packet=await response.clone().json().catch(()=>null);
      if(!response.ok||packet?.ok!==true){console.warn('Telegram native video upload failed:',response.status);return response}
      published=true;
      await sendRemainingText(String(u),body.chat_id,packet.result?.message_id,out.remaining);
      console.info('Midan video published natively', {messageId:packet.result?.message_id,bytes:media.size});
      return response;
    }catch(e){if(published)throw e;console.warn('Video publishing transport failed; retry publisher queue:',String(e.message).slice(0,150));throw e}
    finally{if(media){media.buffer=null;media=null}}
  };
}
module.exports={install:installed,videoCandidates,caption,isPlayable,publicUrl,bounded};
