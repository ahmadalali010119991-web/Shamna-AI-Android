'use strict';
/** Source-verified restoration of two native Telegram videos to the original Midan posts.
 * No source video downloads, external CDN tokens, or persistent temporary files.
 * Protected source forwarding is never bypassed.
 */
const CHAT='@maydan_alkhabar',SOURCE_CHANNEL='@suhebb0';
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
 if(!own.ok||!['administrator','creator'].includes(own.result?.status)||own.result?.can_delete_messages===false)
  throw Error('Bot lacks verified channel editing/cleanup access');
}
async function sourceHtml(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'user-agent':'MidanAlKhabarBot/retro-audit'}});
 if(!r.ok)throw Error('Original Telegram page HTTP '+r.status);
 const len=+(r.headers.get('content-length')||0);if(len>1800000)throw Error('Telegram page oversized');
 const chunks=[];let n=0;for await(const c of r.body){n+=c.length;if(n>1800000)throw Error('Telegram page oversized');chunks.push(Buffer.from(c))}
 return Buffer.concat(chunks).toString('utf8');
}
async function deleteTemporary(token,id){
 for(let attempt=0;attempt<2;attempt++){
  try{const r=await api(token,'deleteMessage',{chat_id:CHAT,message_id:id});if(r.ok)return true}catch{}
 }
 return false;
}
async function backfillOne(token,item,publicOwn,publicSource){
 let existing=section(publicOwn,'maydan_alkhabar',item.target);
 if(!existing.includes(item.needle))throw Error('Target post '+item.target+' does not match verified source title');
 if(/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/.test(existing))
  return {messageId:item.target,status:'already_has_video'};
 const source=section(publicSource,'suhebb0',item.from);
 if(!/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/.test(source))
  throw Error('The original '+item.from+' does not advertise video');
 let forwardedId=null,removed=false;
 try{
  const forwarded=await api(token,'forwardMessage',{chat_id:CHAT,from_chat_id:SOURCE_CHANNEL,message_id:item.from,disable_notification:true});
  if(!forwarded.ok)throw Error('Source Telegram forwarding forbidden/unavailable: '+String(forwarded.description||forwarded.httpStatus).slice(0,90));
  forwardedId=forwarded.result?.message_id;
  const fileId=forwarded.result?.video?.file_id;
  if(!Number.isSafeInteger(forwardedId)||!fileId)throw Error('Forwarded source is not a native video');
  const meta=caption(item);
  const reply_markup={inline_keyboard:[[{text:'📲 افتح الخبر في ميدان الخبر',url:'https://midan-al-khabar.vercel.app/open.html?source='+encodeURIComponent(meta.source)}]]};
  const edited=await api(token,'editMessageMedia',{chat_id:CHAT,message_id:item.target,
   media:{type:'video',media:fileId,caption:meta.value,caption_entities:meta.entities,supports_streaming:true},reply_markup});
  if(!edited.ok||!edited.result?.video)throw Error('Telegram media edit failed: '+String(edited.description||edited.httpStatus).slice(0,90));
  return {messageId:item.target,status:'edited',videoConfirmed:true};
 }finally{
  if(forwardedId!==null){removed=await deleteTemporary(token,forwardedId);if(!removed)console.error('Temporary media forward cleanup did not complete, messageId:',forwardedId)}
 }
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
