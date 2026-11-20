'use strict';
/**
 * Opt-in private Telegram channel_post ingress. Does not auto-post: enqueues
 * source-bound draft events for the Midan editorial and media pipeline.
 * Must be wired to a Telegram webhook using a secret path or the
 * X-Telegram-Bot-Api-Secret-Token header and atomic durable storage.
 */
const {createHash,timingSafeEqual}=require('node:crypto');
const {normalize,identity}=require('./media-contract.cjs');
function equal(a,b){
 const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
 return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);
}
function photoFile(message){
 const p=Array.isArray(message?.photo)?message.photo:[];
 const best=p.filter(x=>typeof x?.file_id==='string').sort((a,b)=>(b.file_size||0)-(a.file_size||0))[0];
 return best?.file_id;
}
function sourceEvent(update,{allowedChatIds=[]}={}){
 const msg=update?.channel_post||update?.edited_channel_post;
 if(!msg||msg.chat?.type!=='channel')return null;
 const chatId=String(msg.chat.id||'');
 if(!allowedChatIds.map(String).includes(chatId))throw Error('SOURCE_CHAT_NOT_ALLOWED');
 const messageId=Number(msg.message_id);
 if(!Number.isInteger(messageId)||messageId<1)throw Error('INVALID_MESSAGE_ID');
 const mediaKind=msg.video||msg.document?.mime_type?.startsWith('video/')?'video':
  photoFile(msg)?'photo':'text';
 const title=String(msg.text||msg.caption||'').trim();
 if(!title)return null;
 // A private chat message may have no public URL. Never synthesize t.me/c
 // as a publicly accessible origin; use a private publisher pseudonym.
 const stableId='telegram-private-'+chatId.replace('-','m')+'-'+messageId;
 const sourceUrl='https://t.me/'+(msg.chat.username||'midan_alkhabar');
 const media=[];
 if(msg.video?.file_id)media.push({kind:'video',fileId:msg.video.file_id,verified:false,origin:'telegram-channel-post'});
 if(msg.document?.mime_type?.startsWith('video/')&&msg.document.file_id)
  media.push({kind:'video',fileId:msg.document.file_id,verified:false,origin:'telegram-channel-post'});
 const photo=photoFile(msg);
 if(photo)media.push({kind:'photo',fileId:photo,verified:false,origin:'telegram-channel-post',isOriginal:true});
 const article=normalize({id:stableId,title,sourceUrl,mediaKind,media});
 return {key:identity(article),article,sourceChatId:chatId,sourceMessageId:messageId,
  sourcePrivate:!msg.chat.username,updateId:Number(update.update_id)||null};
}
function createTelegramChannelIngress({secret,allowedChatIds=[],enqueue}={}){
 if(typeof secret!=='string'||secret.length<24)throw Error('WEBHOOK_SECRET_REQUIRED');
 if(!allowedChatIds.length||typeof enqueue!=='function')throw Error('SOURCE_POLICY_OR_QUEUE_REQUIRED');
 return async(req,res)=>{
  const done=(s,v)=>{res.setHeader('Cache-Control','no-store');return res.status(s).json(v)};
  if(req.method!=='POST')return done(405,{ok:false});
  if(!equal(req.headers?.['x-telegram-bot-api-secret-token'],secret))return done(401,{ok:false});
  if(!req.body||typeof req.body!=='object')return done(400,{ok:false});
  let event;
  try{event=sourceEvent(req.body,{allowedChatIds});}
  catch(e){return done(e.message==='SOURCE_CHAT_NOT_ALLOWED'?403:400,{ok:false,error:e.message});}
  if(!event)return done(200,{ok:true,ignored:true});
  try{
   const recorded=await enqueue(event);
   if(!recorded?.accepted||!recorded?.jobId)throw Error('ENQUEUE_UNCONFIRMED');
   return done(200,{ok:true,accepted:true,jobId:String(recorded.jobId),
    alreadyExists:!!recorded.alreadyExists});
  }catch{return done(503,{ok:false,retryable:true});}
 };
}
module.exports={sourceEvent,createTelegramChannelIngress};
