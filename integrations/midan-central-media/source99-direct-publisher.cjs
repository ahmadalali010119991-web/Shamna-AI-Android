'use strict';
/**
 * Owner source99 public feed -> Telegram channel, bypassing editorial ranking.
 * Preserves original media. Existing state-v3.once holds atomic publication lease.
 */
const DEFAULT_FEED='https://midan-al-khabar.vercel.app/api/news';
const TELEGRAM='https://t.me/s/Private_Source99';
const escape=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;|&apos;/gi,"'");
function extractMedia(html,id,kind){
 const block=String(html||'').split(/<div class="tgme_widget_message_wrap\b/).slice(1)
  .find(x=>new RegExp('data-post="Private_Source99/'+id+'"(?!\\d)').test(x));
 if(!block)return null;
 const pattern=kind==='video'
  // Telegram exposes native clips under tgme_widget_message_video,
  // sometimes on a <video> and sometimes as a descendant <source>.
  ? /<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["']/i
  : /background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i;
 let raw=block.match(pattern)?.[1];
 if(kind==='video'&&!raw){
  for(const tag of block.match(/<[^>]{1,1100}>/g)||[]){
   if(!/tgme_widget_message_video/i.test(tag))continue;
   raw=tag.match(/\b(?:src|data-video|data-src)=["']([^"']+)["']/i)?.[1];
   if(raw)break;
  }
 }
 if(!raw)return null;
 try{
  const url=new URL(decode(raw),TELEGRAM);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||
    /(^|\.)localhost$|(^|\.)local$|(^|\.)internal$/.test(url.hostname)||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))return null;
  return url.href;
 }catch{return null}
}
async function mediaBlob(url,{fetcher=fetch,video=false}={}){
 const r=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(25000)});
 if(!r.ok||r.status>=300)throw Error('SOURCE_MEDIA_UNAVAILABLE');
 const type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const valid=video?['video/mp4','video/webm','video/quicktime']:['image/jpeg','image/png','image/webp'];
 if(!valid.includes(type))throw Error('SOURCE_MEDIA_CONTENT_TYPE');
 const max=video?45_000_000:9_000_000;
 if(Number(r.headers.get('content-length')||'0')>max)throw Error('SOURCE_MEDIA_TOO_LARGE');
 const arr=await r.arrayBuffer();
 if(arr.byteLength===0||arr.byteLength>max)throw Error('SOURCE_MEDIA_INVALID_LENGTH');
 const buf=new Uint8Array(arr);
 if(video && type==='video/mp4' && (buf.length<12||String.fromCharCode(...buf.slice(4,8))!=='ftyp'))
  throw Error('INVALID_VIDEO_SIGNATURE');
 if(!video && type==='image/jpeg' && !(buf[0]===255&&buf[1]===216))
  throw Error('INVALID_IMAGE_SIGNATURE');
 if(!video && type==='image/png' && !(buf[0]===137&&buf[1]===80))
  throw Error('INVALID_IMAGE_SIGNATURE');
 return {blob:new Blob([arr],{type}),type};
}
function createSource99Publisher({fetcher=fetch,once,botToken,chatId='@maydan_alkhabar',siteUrl=DEFAULT_FEED}={}){
 if(typeof once!=='function')throw Error('PERSISTENT_ONCE_REQUIRED');
 if(typeof botToken!=='string'||!botToken)throw Error('TELEGRAM_TOKEN_REQUIRED');
 async function telegram(method,form){
  const r=await fetcher('https://api.telegram.org/bot'+botToken+'/'+method,
   {method:'POST',body:form,signal:AbortSignal.timeout(65000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok!==true||!Number.isInteger(data.result?.message_id))
   throw Error('Telegram rejected: '+(data.description||r.status));
  return data.result;
 }
 async function run(){
  const r=await fetcher(siteUrl,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('SOURCE99_FEED_UNAVAILABLE');
  const payload=await r.json();
  const posts=(payload.articles||[]).filter(a=>a.sourceId==='private-source99'
   && /^private-source99-[1-9]\d*$/.test(String(a.id||''))
   && a.sourceUrl==='https://t.me/Private_Source99/'+a.id.split('-').at(-1)
   && String(a.title||'').trim()
   && !(/^Channel created$/i.test(String(a.title||''))))
   .sort((a,b)=>(Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1)))).slice(-12);
  let html='';
  const results=[];
  for(const post of posts){
   const result={id:post.id,status:'unknown'};
   try{
    const receipt=await once('source99:'+post.id,async()=>{
     const isVideo=post.hasOriginalVideo===true,isPhoto=post.hasOriginalPhoto===true;
     const caption='<b>'+escape(post.title).slice(0,750)+'</b>\n\n<a href="'+escape(post.sourceUrl)+'">المصدر الأصلي</a>';
     if(isPhoto||isVideo){
      if(!html){
       const s=await fetcher(TELEGRAM,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000)});
       if(!s.ok)throw Error('SOURCE99_HTML_UNAVAILABLE');
       html=(await s.text()).slice(0,3_000_000);
      }
      const mediaUrl=extractMedia(html,post.id.split('-').at(-1),isVideo?'video':'photo');
      if(!mediaUrl)throw Error('ORIGINAL_MEDIA_NOT_FOUND');
      const {blob,type}=await mediaBlob(mediaUrl,{fetcher,video:isVideo});
      // Telegram Bot API sendVideo is an MPEG4 player. Do not mislabel a
      // QuickTime or WebM stream as an MP4 upload.
      if(isVideo&&type!=='video/mp4')throw Error('VIDEO_TRANSCODING_REQUIRED');
      const form=new FormData();
      form.set('chat_id',chatId);form.set('parse_mode','HTML');
      form.set('caption',caption.slice(0,1024));
      form.set(isVideo?'video':'photo',blob,isVideo?'original.mp4':type==='image/png'?'original.png':'original.jpg');
      if(isVideo)form.set('supports_streaming','true');
      return telegram(isVideo?'sendVideo':'sendPhoto',form);
     }
     const form=new FormData();
     form.set('chat_id',chatId);form.set('parse_mode','HTML');form.set('text',caption.slice(0,4096));
     form.set('disable_web_page_preview','true');
     return telegram('sendMessage',form);
    });
    result.status=receipt.status||'sent';result.messageId=receipt.receipt?.message_id||null;
   }catch(e){result.status='retry';result.error=String(e?.message||e).slice(0,110)}
   results.push(result);
  }
  return {total:posts.length,results};
 }
 return {run};
}
module.exports={createSource99Publisher,extractMedia,mediaBlob};
