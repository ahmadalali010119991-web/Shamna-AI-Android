'use strict';
/**
 * Send the same image as the original publisher whenever the originating
 * article has an actual image. This wraps only sendMessage requests containing
 * an explicitly attributed external article URL. Other Telegram calls,
 * currency/gold/fuel posts, and non-news notifications are unaffected.
 */
const capturedFetch=globalThis.fetch;
const MAX_IMAGE=9_000_000;
const MAX_PAGE=2_000_000;
const timeout=ms=>AbortSignal.timeout(ms);
const htmlDecode=x=>String(x||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;|&#x27;/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function publicHttps(raw){
  try{
    const u=new URL(htmlDecode(raw));
    const h=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||
       !h.includes('.')||h==='localhost'||h.endsWith('.local')||
       /^(?:10|127|0|192\.168|169\.254|172\.(?:1[6-9]|2\d|3[01]))\./.test(h)||
       h.endsWith('.internal')||h.endsWith('.test'))return null;
    return u.href;
  }catch{return null}
}
function sourceLink(body){
  const text=String(body.text||'');
  const raw=text.match(/(?:^|\n)\s*(?:🔗\s*)?(?:(?:المصدر(?:\s+الأصلي)?|المنشور الأصلي)\s*[:：]\s*)?(https:\/\/[^\s<>"]+)/gmu)||[];
  for(const line of raw.reverse()){
    const hit=line.match(/https:\/\/[^\s<>"]+/);
    if(hit){const url=publicHttps(hit[0]);if(url)return url}
  }
  const html=text.match(/<a\s+[^>]*href=["'](https:\/\/[^"']+)["'][^>]*>\s*(?:المصدر|عرض المصدر|المنشور الأصلي)\s*<\/a>/iu);
  if(html)return publicHttps(html[1]);
  const ent=[...(body.entities||[])].find(e=>e.type==='text_link'&&e.url);
  return ent?publicHttps(ent.url):null;
}
function parseAttrs(s){
  const attrs={};
  for(const m of s.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))attrs[m[1].toLowerCase()]=htmlDecode(m[3]);
  return attrs;
}
function extractMetaImages(html,url){
  const found=[];
  const add=(v)=>{
    if(!v)return;
    try{const s=publicHttps(new URL(htmlDecode(v),url).href);if(s)found.push(s)}catch{}
  };
  for(const m of String(html).matchAll(/<meta\b[^>]*>/gi)){
    const attrs=parseAttrs(m[0]);
    const name=(attrs.property||attrs.name||attrs.itemprop||'').toLowerCase();
    if(['og:image','og:image:url','twitter:image','twitter:image:src','image'].includes(name))add(attrs.content);
  }
  // Telegram public post uses a CSS background-image for attached photos.
  if(/t\.me$|telegram\.me$/.test(new URL(url).hostname)){
    for(const match of String(html).matchAll(/tgme_widget_message_photo_wrap[^>]*style\s*=\s*(["'])([\s\S]*?)\1/gi)){
      const matchUrl=htmlDecode(match[2]).match(/background-image\s*:\s*url\((?:&quot;|['"])?([^)'"]+)/i);
      if(matchUrl)add(matchUrl[1]);
    }
  }
  // Article/NewsArticle structured metadata may provide the actual photo.
  for(const match of String(html).matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const document=JSON.parse(match[1].trim());
      const blocks=Array.isArray(document)?document:[document];
      for(const obj of blocks){
        const articles=[obj,...(Array.isArray(obj['@graph'])?obj['@graph']:[])];
        for(const a of articles){
          if(!/NewsArticle|Article|ReportageNewsArticle/i.test(String(a['@type']||'')))continue;
          const im=a.image;
          if(typeof im==='string')add(im);
          else if(Array.isArray(im))im.forEach(x=>add(typeof x==='string'?x:x?.url||x?.contentUrl));
          else if(im)add(im.url||im.contentUrl);
        }
      }
    }catch{}
  }
  const usable=found.filter(v=>!/(?:favicon|brand|avatar|default[-_]?image|site[-_]?logo|telegram[-_]?logo|logo)[-_.\/]/i.test(new URL(v).pathname));
  return [...new Set(usable)];
}
async function fetched(url,{binary=false,maxBytes=MAX_PAGE}={}){
  let current=publicHttps(url);
  if(!current)throw Error('Untrusted source/image URL');
  for(let i=0;i<3;i++){
    const resp=await capturedFetch(current,{method:'GET',redirect:'manual',cache:'no-store',
       headers:{'accept':binary?'image/jpeg,image/png,image/webp,image/*':'text/html,application/xhtml+xml',
                'user-agent':'Mozilla/5.0 (compatible; MidanAlKhabarBot/4.0)'},
       signal:timeout(binary?17000:11000)});
    if([301,302,303,307,308].includes(resp.status)){
      const redirect=resp.headers.get('location');
      if(!redirect)throw Error('Missing redirect target');
      current=publicHttps(new URL(redirect,current).href);
      if(!current)throw Error('Untrusted redirect target');
      continue;
    }
    if(!resp.ok)throw Error('Source HTTP '+resp.status);
    const size=Number(resp.headers.get('content-length')||0);
    if(size>maxBytes)throw Error('Source image/page too large');
    let chunks=[],len=0;
    if(!resp.body)throw Error('Empty source response');
    for await(const chunk of resp.body){
      len+=chunk.length;
      if(len>maxBytes){try{await resp.body.cancel()}catch{};throw Error('Source exceeds size limit')}
      chunks.push(Buffer.from(chunk));
    }
    return {buffer:Buffer.concat(chunks),type:resp.headers.get('content-type')||'',url:current};
  }
  throw Error('Too many redirects');
}
function validPhoto(b,type){
  if(b.length<4000||b.length>MAX_IMAGE)return false;
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return true;
  if(b.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return true;
  // Telegram sendPhoto can accept WebP in some contexts, but convert it elsewhere
  // rather than risk an invalid Telegram image publication.
  return false;
}
async function originalImage(url){
  const page=await fetched(url,{maxBytes:MAX_PAGE});
  if(!/text\/html|application\/xhtml/i.test(page.type))return {status:'no-html'};
  const html=page.buffer.toString('utf8');
  const candidates=extractMetaImages(html,page.url);
  if(!candidates.length)return {status:'no-image'};
  for(const candidate of candidates.slice(0,3)){
    try{
      const img=await fetched(candidate,{binary:true,maxBytes:MAX_IMAGE});
      if(validPhoto(img.buffer,img.type))
        return {status:'image',buffer:img.buffer,url:img.url,mime:img.buffer[0]===0xff?'image/jpeg':'image/png'};
    }catch(e){console.warn('Original publisher photo inaccessible:',e.message)}
  }
  return {status:'image-unavailable'}; // NEVER silently treat known pictured article as text-only.
}
function makeCaption(text,url){
  const clean=htmlDecode(String(text).replace(/<[^>]*>/g,' ')
    .replace(/(?:^|\n)\s*(?:🔗\s*)?(?:المصدر(?:\s+الأصلي)?\s*[:：]\s*)?https:\/\/[^\s]+/gmu,'')
    .replace(/\s+/g,' ').trim());
  const max=980;const part=clean.length>max?clean.slice(0,max-1).trimEnd()+'…':clean;
  const caption=part+'\n\n🔗 المصدر';
  const offset=caption.lastIndexOf('المصدر');
  return {caption,caption_entities:[{type:'text_link',offset,length:'المصدر'.length,url}]};
}
function install(){
  if(globalThis.__MIDAN_ORIGINAL_PHOTO_INSTALLED)return;
  globalThis.__MIDAN_ORIGINAL_PHOTO_INSTALLED=true;
  const prior=globalThis.fetch;
  globalThis.fetch=async function(input,init){
    const url=typeof input==='string'?input:input?.url;
    if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?.*)?$/i.test(String(url||''))||
       !init?.body||typeof init.body!=='string')return prior.apply(this,arguments);
    let body;
    try{body=JSON.parse(init.body)}catch{return prior.apply(this,arguments)}
    if(!body||typeof body.text!=='string')return prior.apply(this,arguments);
    const origin=sourceLink(body);
    if(!origin)return prior.apply(this,arguments);
    try{
      const result=await originalImage(origin);
      if(result.status==='image'){
        const form=new FormData();
        for(const k of ['chat_id','message_thread_id','reply_to_message_id','disable_notification',
           'protect_content','reply_markup']){
          if(body[k]===undefined||body[k]===null)continue;
          form.append(k,typeof body[k]==='object'?JSON.stringify(body[k]):String(body[k]));
        }
        const caption=makeCaption(body.text,origin);
        form.append('photo',new Blob([result.buffer],{type:result.mime}),'miden-news-source.'+(result.mime==='image/png'?'png':'jpg'));
        form.append('caption',caption.caption);
        form.append('caption_entities',JSON.stringify(caption.caption_entities));
        const target=String(url).replace(/\/sendMessage(\?.*)?$/i,'/sendPhoto$1');
        return prior.call(this,target,{...init,body:form,headers:undefined});
      }
      if(result.status==='image-unavailable'){
        // If source confirms an image exists but it cannot be downloaded,
        // do not publish a misleading text-only news update.
        throw Error('Original article contains a photo but media is unavailable; retry original news later');
      }
    }catch(err){
      // Propagate fail-closed for confirmed missing media; but a source page
      // temporarily unavailable doesn't establish it has an image.
      if(String(err.message).startsWith('Original article contains'))throw err;
      console.warn('Publisher source media discovery unavailable:',String(err.message).slice(0,120));
    }
    return prior.apply(this,arguments);
  };
}
module.exports={publicHttps,sourceLink,extractMetaImages,validPhoto,originalImage,makeCaption,install};
