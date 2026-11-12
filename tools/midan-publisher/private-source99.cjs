'use strict';
/**
 * @Private_Source99 is the owner's public source input. Preserve its actual post
 * URL and media provenance; never invent a dateline, verification or country.
 * This module never posts to Telegram by itself: the existing publisher consumes
 * the same canonical /api/news output and its existing idempotency queue.
 */
const SOURCE='https://t.me/s/Private_Source99';
let cache={at:0,posts:[]};
const decode=s=>String(s||'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,
 t=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'",'&#x27;':"'"}[t.toLowerCase()]||t));
const plain=html=>decode(String(html||'').replace(/<br\s*\/?>/gi,'\n')
 .replace(/<\/p\s*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/\r/g,'')
 .replace(/[ \t]+/g,' ').replace(/\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function parse(html){
 const blocks=String(html||'').split(/<div class="tgme_widget_message_wrap\b/).slice(1),out=[],ids=new Set();
 for(const block of blocks){
  const id=Number((block.match(/\bdata-post="Private_Source99\/([1-9]\d{0,11})"/)||[])[1]);
  if(!Number.isSafeInteger(id)||ids.has(id))continue;
  ids.add(id);
  const time=(block.match(/\bdatetime="([^"]+)"/)||[])[1];
  const when=Date.parse(time||'');
  if(!Number.isFinite(when)||when>Date.now()+5*60000)continue;
  const matched=block.match(/\bclass="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const content=plain(matched?.[1]);
  if(!content||content==='Channel created'||content.length<18)continue;
  const link='https://t.me/Private_Source99/'+id;
  const title=(content.split(/\n/).find(x=>x.length>=12)||content).replace(/^#[^\s]+\s*/,'').slice(0,200).trim();
  const summary=content.slice(0,1500);
  const hasVideo=/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/i.test(block);
  const hasPhoto=/tgme_widget_message_photo_wrap|tgme_widget_message_photo/i.test(block);
  out.push({
   id:'private-source99-'+id,title,url:link,sourceUrl:link,originalPostUrl:link,
   summary,source:'مصدر خاص',sourceId:'private-source99',
   sourceGroup:'special',language:'ar',publishedAt:new Date(when).toISOString(),
   verification:'source_report',editorialApproved:false,
   category:'community',editorialSection:'مصدر_خاص',
   editorialTier:2,priority:'normal',importanceScore:60,
   country:'',province:'',isRefugee:false,isWorldNews:false,
   hasOriginalVideo:hasVideo,hasOriginalPhoto:hasPhoto,
   // Publication provenance only; actual media file extraction is handled by
   // Telegram's source-message copy or the existing video/photo publisher.
  });
 }
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
async function fetchSource(){
 if(cache.at&&Date.now()-cache.at<90000)return cache.posts;
 try{
  const response=await fetch(SOURCE,{headers:{accept:'text/html','user-agent':'MidanNewsIngest/1.0'},
   signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const len=+(response.headers.get('content-length')||0);
  if(len>1000000)throw Error('Source oversized');
  let chunks=[],size=0;
  for await(const b of response.body){size+=b.length;if(size>1000000)throw Error('Source exceeds 1MB');chunks.push(Buffer.from(b))}
  const posts=parse(Buffer.concat(chunks).toString('utf8'));
  cache={at:Date.now(),posts};return posts;
 }catch(e){
  console.warn('Private source feed unavailable; existing news stays unchanged:',String(e.message).slice(0,130));
  return cache.posts;
 }
}
module.exports={SOURCE,parse,fetchSource};
