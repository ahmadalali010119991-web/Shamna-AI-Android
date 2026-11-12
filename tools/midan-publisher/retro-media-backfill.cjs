'use strict';
/**
 * ONE-TIME, strictly allowlisted, source-verified 2026-11-12 repair.
 * Only message 496 may be edited. No deletes, duplicate posts or durable media storage.
 */
const CHAT='@maydan_alkhabar',MESSAGE_ID=496;
const HEADLINE='غزة: دمار واسع داخل مستشفى ناصر بعد غارة إسرائيلية قاتلة';
const SOURCE='https://arabic.euronews.com/video/2026/11/12/gaza-devastation-inside-nasser-hospital-after-deadly-israeli-strike';
const VIDEO='https://video.euronews.com/mp4/SHD/60/95/21/03/SHD_PYR_6095213_20261112160244.mp4';
const CAPTION='📰 غزة: دمار واسع داخل مستشفى ناصر بعد غارة إسرائيلية قاتلة\n\n🗞 يورونيوز عربي\nقصفت طائرة إسرائيلية مجمع ناصر الطبي في خان يونس بجنوب غزة فجر الخميس 12 نوفمبر، ما أسفر عن مقتل ستة أشخاص بينهم طبيب وإصابة ما لا يقل عن 27 آخرين، وفق منظمة الصحة العالمية.\n\n🔗 المصدر\n\nتابعنا: إنستغرام | تيك توك';
const INSTA='https://www.instagram.com/alislam_almutab_book/';
const TIKTOK='https://www.tiktok.com/@alislam_almutab_book';
const captions=[
 {type:'text_link',offset:CAPTION.indexOf('المصدر'),length:'المصدر'.length,url:SOURCE},
 {type:'text_link',offset:CAPTION.indexOf('إنستغرام'),length:'إنستغرام'.length,url:INSTA},
 {type:'text_link',offset:CAPTION.indexOf('تيك توك'),length:'تيك توك'.length,url:TIKTOK}
];
const BUTTON={inline_keyboard:[[{text:'📲 افتح الخبر في ميدان الخبر',url:'https://midan-al-khabar.vercel.app/open.html?source='+encodeURIComponent(SOURCE)}]]};
async function boundedText(url,maximum=1300000){
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'MidanAlKhabarBot/retro-media-audit'}});
 if(!r.ok)throw Error('Source '+r.status);
 const parts=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>maximum)throw Error('Source too large');parts.push(Buffer.from(chunk))}
 return Buffer.concat(parts).toString('utf8');
}
async function inspect(){
 const html=await boundedText('https://t.me/s/maydan_alkhabar?before=497');
 const pos=html.indexOf('data-post="maydan_alkhabar/'+MESSAGE_ID+'"');
 if(pos<0)throw Error('Exact Telegram message not in public audit');
 const section=html.slice(pos,pos+13000).split('tgme_widget_message_wrap')[0];
 if(!section.includes(HEADLINE))throw Error('Telegram message title mismatch');
 if(/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/i.test(section))return {alreadyVideo:true};
 if(!/datetime="2026-11-12T/.test(section))throw Error('Source date mismatch');
 return {alreadyVideo:false};
}
async function checkSource(){
 const html=await boundedText(SOURCE);
 if(!html.includes(VIDEO))throw Error('Original publisher did not advertise video rendition');
 const head=await fetch(VIDEO,{method:'HEAD',signal:AbortSignal.timeout(10000)});
 if(!head.ok)throw Error('Publisher video inaccessible');
 const size=+(head.headers.get('content-length')||0);
 if(!Number.isFinite(size)||size<1000000||size>=20000000)throw Error('Publisher video exceeds direct Telegram URL limit');
 return size;
}
async function telegramEdit(media,token,asMultipart=false){
 const url='https://api.telegram.org/bot'+token+'/editMessageMedia';
 const mediaData={type:'video',media,caption:CAPTION,caption_entities:captions,supports_streaming:true};
 let init;
 if(asMultipart){
  const f=new FormData();f.append('chat_id',CHAT);f.append('message_id',String(MESSAGE_ID));
  f.append('media',JSON.stringify(mediaData));f.append('reply_markup',JSON.stringify(BUTTON));
  init={method:'POST',body:f,signal:AbortSignal.timeout(55000)};
 }else{
  init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
   chat_id:CHAT,message_id:MESSAGE_ID,media:mediaData,reply_markup:BUTTON
  }),signal:AbortSignal.timeout(40000)};
 }
 const resp=await fetch(url,init);
 const result=await resp.json().catch(()=>({ok:false,description:'Invalid Telegram response'}));
 return {status:resp.status,result};
}
async function uploadFallback(token){
 const response=await fetch(VIDEO,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Unable to download licensed public video');
 const max=19000000;let size=0,parts=[];
 for await(const c of response.body){size+=c.length;if(size>max)throw Error('Video exceeds 19MB fallback budget');parts.push(Buffer.from(c))}
 let buf=Buffer.concat(parts);parts=[];
 try{
  const url='https://api.telegram.org/bot'+token+'/editMessageMedia';
  const media={type:'video',media:'attach://video',caption:CAPTION,caption_entities:captions,supports_streaming:true};
  const form=new FormData();
  form.append('chat_id',CHAT);form.append('message_id',String(MESSAGE_ID));
  form.append('media',JSON.stringify(media));form.append('reply_markup',JSON.stringify(BUTTON));
  form.append('video',new Blob([buf],{type:'video/mp4'}),'euronews-source.mp4');
  const resp=await fetch(url,{method:'POST',body:form,signal:AbortSignal.timeout(65000)});
  return {status:resp.status,result:await resp.json().catch(()=>({ok:false,description:'Invalid Telegram response'}))};
 }finally{buf=null}
}
module.exports=async function backfill(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.body&&typeof req.body==='object'&&Object.keys(req.body).length)return res.status(400).json({ok:false,error:'No request data allowed'});
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return res.status(503).json({ok:false,error:'Publisher not configured'});
 try{
  const state=await inspect();if(state.alreadyVideo)return res.status(200).json({ok:true,status:'already_has_video',messageId:MESSAGE_ID});
  const bytes=await checkSource();
  let outcome=await telegramEdit(VIDEO,token);
  if(!outcome.result?.ok&&outcome.status===400&&/HTTP URL|wrong file|fetch|webpage|url content/i.test(String(outcome.result?.description||'')))outcome=await uploadFallback(token);
  if(!outcome.result?.ok)return res.status(502).json({ok:false,status:'telegram_rejected',httpStatus:outcome.status,
   error:String(outcome.result?.description||'Media edit rejected').slice(0,160),messageId:MESSAGE_ID});
  const msg=outcome.result.result;
  if(!msg||!msg.video)return res.status(502).json({ok:false,status:'not_confirmed_as_video',messageId:MESSAGE_ID});
  return res.status(200).json({ok:true,status:'edited',messageId:MESSAGE_ID,videoConfirmed:true,bytes});
 }catch(e){return res.status(503).json({ok:false,status:'not_edited',error:String(e.message).slice(0,170),messageId:MESSAGE_ID})}
};
module.exports.caption=CAPTION;
module.exports.messageId=MESSAGE_ID;
module.exports.source=SOURCE;
module.exports.video=VIDEO;
