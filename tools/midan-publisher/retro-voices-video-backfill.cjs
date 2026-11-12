'use strict';
/** Source-verified restoration of two public MP4 news videos to original Midan messages.
 * Read only the public source video, upload via Telegram editMessageMedia, discard bytes.
 * Never store files or create duplicate Telegram posts.
 */
const CHAT='@maydan_alkhabar';
const CHANGES=Object.freeze([
 {target:487,from:47965,needle:'أجبرت الشبيبة',text:'أجبرت الشبيبة الثـ.ـورية الوفد الحكومي على انزال العلم السوري أثناء دخوله الى مدينة القامشلي'},
 {target:491,from:47969,needle:'حسب ماوردني من أحد الأشخاص',text:'|متابعة حسب ماوردني من أحد الأشخاص الذين كانوا مع الوفد الحكومي ... انهم قاموا بإنزال العلم اثناء مصادفة مظاهرة لأنصار قسد في القامشلي وتم إنزال العلم كبادرة حسن نية ومنعاً للأستفزاز'}
]);
function section(html,channel,id){
 const key='data-post="'+channel+'/'+id+'"',pos=html.indexOf(key);
 if(pos<0)throw Error('Original message '+channel+'/'+id+' not found');
 return html.slice(pos,pos+15000).split('tgme_widget_message_wrap')[0];
}
function caption(item){
 const source='https://t.me/suhebb0/'+item.from;
 const value=['🎙️ الميدان السوري | أصوات الميدان','',item.text,'','✍️ المصدر: صهيب اليعربي','',
  '🔗 المنشور الأصلي','#الميدان_السوري','', 'تابعنا: إنستغرام | تيك توك'].join('\n');
 const entities=[
  {type:'text_link',offset:value.indexOf('المنشور الأصلي'),length:'المنشور الأصلي'.length,url:source},
  {type:'text_link',offset:value.indexOf('إنستغرام'),length:'إنستغرام'.length,url:'https://www.instagram.com/alislam_almutab_book/'},
  {type:'text_link',offset:value.indexOf('تيك توك'),length:'تيك توك'.length,url:'https://www.tiktok.com/@alislam_almutab_book'}
 ];
 return {value,entities,source};
}
async function api(token,method,data){
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify(data),signal:AbortSignal.timeout(23000)});
 const j=await r.json().catch(()=>({ok:false,description:'Invalid Telegram response'}));
 return {httpStatus:r.status,...j};
}
async function checkAdmin(token){
 const me=await api(token,'getMe',{});
 if(!me.ok||!Number.isSafeInteger(me.result?.id))throw Error('Cannot verify bot identity');
 const own=await api(token,'getChatMember',{chat_id:CHAT,user_id:me.result.id});
 if(!own.ok||!['administrator','creator'].includes(own.result?.status)||own.result?.can_edit_messages===false)
  throw Error('Bot lacks channel editing access');
}
async function sourceHtml(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'user-agent':'MidanAlKhabarBot/retro-audit'}});
 if(!r.ok)throw Error('Original Telegram page HTTP '+r.status);
 const len=+(r.headers.get('content-length')||0);if(len>1800000)throw Error('Telegram page oversized');
 const chunks=[];let n=0;for await(const c of r.body){n+=c.length;if(n>1800000)throw Error('Telegram page oversized');chunks.push(Buffer.from(c))}
 return Buffer.concat(chunks).toString('utf8');
}
function publicVideoUrl(source){
 // Public embedded Telegram video URLs only, extracted from an EXACT source post.
 const tag=source.match(/<video\b[^>]*\bsrc=(["'])(.*?)\1/i);
 if(!tag)throw Error('No original public video file in the source post');
 const url=tag[2].replace(/&amp;/g,'&');
 let u;try{u=new URL(url)}catch{throw Error('Invalid public video URL')}
 if(u.protocol!=='https:'||u.port||u.username||u.password||!/^cdn[1-9]\.telesco\.pe$/i.test(u.hostname)||!u.pathname.endsWith('.mp4'))
  throw Error('Source video host/file is not recognized');
 return u.href;
}
async function getPublicVideo(source){
 const url=publicVideoUrl(source);
 // Bounded in-memory download only. No disk, logs of expiring CDN tokens, or cloud storage.
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(22000)});
 if(!response.ok)throw Error('Public video source unavailable: '+response.status);
 const length=Number(response.headers.get('content-length')||0);
 const type=String(response.headers.get('content-type')||'');
 if(length>19*1024*1024||(!type.includes('video/mp4')&&!type.includes('application/octet-stream')))
  throw Error('Original video size or media type is incompatible');
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>19*1024*1024)throw Error('Original video exceeded 19 MB');chunks.push(Buffer.from(chunk))}
 const bytes=Buffer.concat(chunks);chunks.length=0;
 if(bytes.length<1024||bytes.toString('ascii',4,8)!=='ftyp')throw Error('Invalid MP4 signature');
 return bytes;
}
async function editNativeVideo(token,item,bytes){
 const meta=caption(item), form=new FormData();
 const media={type:'video',media:'attach://original_video',caption:meta.value,caption_entities:meta.entities,supports_streaming:true};
 const button={inline_keyboard:[[{text:'📲 افتح الخبر في ميدان الخبر',url:'https://midan-al-khabar.vercel.app/open.html?source='+encodeURIComponent(meta.source)}]]};
 form.append('chat_id',CHAT);form.append('message_id',String(item.target));
 form.append('media',JSON.stringify(media));form.append('reply_markup',JSON.stringify(button));
 form.append('original_video',new Blob([bytes],{type:'video/mp4'}),'original-source-video.mp4');
 const response=await fetch('https://api.telegram.org/bot'+token+'/editMessageMedia',
  {method:'POST',body:form,signal:AbortSignal.timeout(55000)});
 const output=await response.json().catch(()=>({ok:false,description:'Invalid Telegram response'}));
 if(!output.ok||!output.result?.video)
  throw Error('Telegram media edit failed: '+String(output.description||response.status).slice(0,90));
 return output.result.message_id;
}
async function backfillOne(token,item,publicOwn,publicSource){
 const existing=section(publicOwn,'maydan_alkhabar',item.target);
 if(!existing.includes(item.needle))throw Error('Target post '+item.target+' does not match verified source title');
 if(/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/.test(existing))
  return {messageId:item.target,status:'already_has_video'};
 const source=section(publicSource,'suhebb0',item.from);
 if(!/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/.test(source))
  throw Error('The original '+item.from+' has no public video');
 let bytes=await getPublicVideo(source);
 try{
  const editedId=await editNativeVideo(token,item,bytes);
  if(editedId!==item.target)throw Error('Unexpected edited Telegram message ID');
  return {messageId:item.target,status:'edited',videoConfirmed:true,bytes:bytes.length};
 }finally{bytes.fill(0);bytes=null}
}
module.exports=async function backfillVoices(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.body&&typeof req.body==='object'&&Object.keys(req.body).length)return res.status(400).json({ok:false,error:'No request data accepted'});
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return res.status(503).json({ok:false,error:'Telegram not configured'});
 try{
  await checkAdmin(token);
  const [own,source]=await Promise.all([
    sourceHtml('https://t.me/s/maydan_alkhabar?before=492'),
    sourceHtml('https://t.me/s/suhebb0?before=47970')
  ]);
  const result=[];
  for(const item of CHANGES){
    try{result.push(await backfillOne(token,item,own,source))}
    catch(e){result.push({messageId:item.target,status:'not_edited',error:String(e.message).slice(0,150)})}
  }
  const allOk=result.every(x=>x.status==='edited'||x.status==='already_has_video');
  return res.status(allOk?200:207).json({ok:allOk,result});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message).slice(0,150)})}
};
module.exports.CHANGES=CHANGES;
module.exports.caption=caption;
module.exports.section=section;
module.exports.publicVideoUrl=publicVideoUrl;
