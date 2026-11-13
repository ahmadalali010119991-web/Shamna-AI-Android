'use strict';
/* Video-first media routing. Never expose BOT_TOKEN, and fall back to prior news behavior
 * if the source channel disallows copying or source metadata is unavailable. */
const PUBLIC_SOURCE=/https?:\/\/t\.me\/([a-zA-Z0-9_]{5,32})\/(\d+)/gi;
const videoCache=new Map(),VIDEO_TTL=3*60*1000;
let installed=false;
function originalPost(payload){
 const all=String(payload.caption||payload.text||"")+" "+JSON.stringify(payload.reply_markup||{});
 const match=[...all.matchAll(PUBLIC_SOURCE)].find(m=>m[1].toLowerCase()!=="maydan_alkhabar");
 return match?{handle:match[1],id:Number(match[2])}:null
}
async function sourceVideo(post,fetcher){
 const key=post.handle+"/"+post.id,existing=videoCache.get(key);
 if(existing&&Date.now()-existing.at<VIDEO_TTL)return existing.found;
 let found=false;
 try{
  const u="https://t.me/s/"+post.handle+"?before="+(post.id+1);
  const r=await fetcher(u,{signal:AbortSignal.timeout(6500),headers:{"User-Agent":"MidanNews/1.0"}});
  if(r.ok){
   const raw=await r.text(),mark='data-post="'+key+'"',start=raw.indexOf(mark);
   if(start>=0){
    const end=raw.indexOf('tgme_widget_message_wrap',start+mark.length),html=raw.slice(start,end>start?end:start+18000);
    found=/tgme_widget_message_video_player|tgme_widget_message_video_thumb|Media is too big|tgme_widget_message_roundvideo_player/.test(html);
   }
  }
 }catch(e){/* network problems leave original publisher unchanged */}
 videoCache.set(key,{found,at:Date.now()});
 if(videoCache.size>200){const first=videoCache.keys().next().value;videoCache.delete(first)}
 return found
}
function install(){
 if(installed)return;installed=true;
 const original=globalThis.fetch;
 if(typeof original!=='function')return;
 globalThis.fetch=async function(url,init){
  try{
   const raw=typeof url==='string'?url:url?.url||'';
   if(!/^https:\/\/api\.telegram\.org\/bot[^\/]+\/(?:sendPhoto|sendMessage)$/i.test(raw)||typeof init?.body!=='string')return original.apply(this,arguments);
   const data=JSON.parse(init.body),from=originalPost(data);
   if(!from||!data.chat_id||!String(data.chat_id).trim())return original.apply(this,arguments);
   const isVideo=await sourceVideo(from,original);
   if(!isVideo)return original.apply(this,arguments);
   const caption=String(data.caption||data.text||'');
   if(caption.length>980)return original.apply(this,arguments);
   const target=raw.replace(/\/(?:sendPhoto|sendMessage)$/i,'/copyMessage');
   const copy={chat_id:data.chat_id,from_chat_id:'@'+from.handle,message_id:from.id,caption:caption};
   if(data.parse_mode)copy.parse_mode=data.parse_mode;
   if(data.reply_markup)copy.reply_markup=data.reply_markup;
   const r=await original(target,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(copy),signal:AbortSignal.timeout(14000)});
   const j=await r.json().catch(()=>null);
   if(r.ok&&j?.ok&&j.result?.message_id){
    // The Bot API returns MessageId for copyMessage, whereas sendPhoto returns Message.
    // Match the fields used by the caller while preserving the exact confirmed message ID.
    return new Response(JSON.stringify({ok:true,result:{message_id:j.result.message_id,chat:{id:data.chat_id},video:{source_copy:true}}}),{status:200,headers:{'Content-Type':'application/json'}});
   }
  }catch(e){console.warn('Video-first Telegram copy unavailable, falling back to original send')}
  return original.apply(this,arguments)
 }
}
async function backfill552(){
 const bot=process.env.TELEGRAM_BOT_TOKEN,chat='@maydan_alkhabar';
 if(!bot)throw Error('Production Telegram bot token is not configured');
 const endpoint='https://api.telegram.org/bot'+bot+'/';
 const post=async(method,payload)=>{
  const r=await fetch(endpoint+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(24000)});
  const d=await r.json().catch(()=>null);
  if(!r.ok||!d?.ok)throw Error(method+' failed: '+String(d?.description||r.status).replace(bot,'[redacted]').slice(0,180));
  return d.result
 };
 const forwarded=await post('forwardMessage',{chat_id:chat,from_chat_id:SOURCE,message_id:47987,disable_notification:true});
 const temp=forwarded?.message_id;
 if(!temp)throw Error('Source forward did not return message ID');
 let editOK=false,deleteOK=false,error=null;
 try{
  const video=forwarded.video||((forwarded.document?.mime_type||'').startsWith('video/')?forwarded.document:null);
  if(!video?.file_id)throw Error('Source did not expose a reusable original video file_id');
  const text=[
  '🎙️ <b>الميدان السوري | أصوات الميدان</b>',
  '',
  '#الرقة',
  'يناشد المواطن محمد حجو والد الطفل يحيى وزارة الصحة تشكيل لجنة تحقيق مستقلة من خارج محافظة الرقة لكشف ملابسات وفاة طفله بعد 8 أيام من إدخاله إلى المشفى الوطني، وسط اتهامات بالإهمال الطبي.',
  '',
  'كما طالب الجهات القضائية بمتابعة الشكوى المقدمة ومحاسبة كل من يثبت تقصيره أو مسؤوليته عن الوفاة.',
  '',
  '✍️ المصدر: صهيب اليعربي',
  '🔗 <a href="https://t.me/suhebb0/47987">المنشور الأصلي</a>',
  '#الميدان_السوري'].join('\n');
  const media={type:'video',media:video.file_id,caption:text,parse_mode:'HTML',supports_streaming:true};
  const markup={inline_keyboard:[
   [{text:'اقرأ المصدر الأصلي',url:'https://t.me/suhebb0/47987'}],
   [{text:'افتح الخبر في ميدان الخبر',url:'https://midan-al-khabar.vercel.app/'}]
  ]};
  await post('editMessageMedia',{chat_id:chat,message_id:552,media,reply_markup:markup});
  editOK=true;
 }catch(e){error=String(e.message||e).slice(0,300)}
 finally{
  try{await post('deleteMessage',{chat_id:chat,message_id:temp});deleteOK=true}
  catch(e){error=(error?error+' | ':'')+'Temp cleanup: '+String(e.message).slice(0,120)}
 }
 return {updatedExistingMessage:editOK,targetMessageId:552,originalSourceMessageId:47987,temporaryForwardRemoved:deleteOK,error};
}
module.exports={install,backfill552};
