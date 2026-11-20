'use strict';
/**
 * One-time, GitHub-OIDC-authorized native-video smoke test.
 * Creates a disposable Telegram message and deletes it in finally.
 * Never uses or changes real news content.
 */
const crypto=require('node:crypto');
const {createMediaRetryGateway}=require('./media-retry-gateway');
const repoName='ahmadalali010119991-web/Shamna-AI-Android';
const workflowRef=repoName+'/.github/workflows/midan-telegram-sync.yml@refs/heads/main';
async function verifyOIDC(req){
 try{
  const jwt=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const parts=jwt.split('.');
  if(parts.length!==3||parts.some(x=>!x||x.length>7000))return false;
  const h=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  const c=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  const n=Math.floor(Date.now()/1000);
  if(h.alg!=='RS256'||!h.kid||c.iss!=='https://token.actions.githubusercontent.com'||
   c.aud!=='dallalna-telegram-bridge'||c.repository!==repoName||
   String(c.repository_id)!=='1407097751'||c.ref!=='refs/heads/main'||
   c.workflow_ref!==workflowRef||c.event_name!=='push'||
   !Number.isFinite(c.exp)||c.exp<n||!Number.isFinite(c.iat)||c.iat<n-600||c.iat>n+60)return false;
  const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',
   {signal:AbortSignal.timeout(9000)});
  if(!r.ok)return false;
  const k=(await r.json()).keys?.find(x=>x.kid===h.kid&&x.kty==='RSA');
  return !!k&&crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),
   crypto.createPublicKey({key:k,format:'jwk'}),Buffer.from(parts[2],'base64url'));
 }catch{return false;}
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST_ONLY'});
 if(!(await verifyOIDC(req)))return res.status(401).json({ok:false,error:'UNAUTHORIZED'});
 if(process.env.MIDAN_MEDIA_RETRY_ENABLED!=='true')return res.status(503).json({ok:false,error:'QUEUE_NOT_ENABLED'});
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,error:'BOT_NOT_CONFIGURED'});
 const channel='@maydan_alkhabar',base='https://api.telegram.org/bot'+token+'/';
 let messageId=null,deleted=false,success=false,videoFileId=null,queueStatus=null,error=null;
 const bot=async(method,body)=>{
  const r=await fetch(base+method,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(27000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok!==true)throw Error('TELEGRAM_'+method+'_'+String(d.description||r.status).slice(0,100));
  return d.result;
 };
 try{
  const message=await bot('sendMessage',{chat_id:channel,text:'اختبار تقني مؤقت لنظام الفيديو — سيُحذف تلقائياً.'});
  messageId=Number(message.message_id);
  if(!Number.isSafeInteger(messageId)||messageId<=0)throw Error('MISSING_MESSAGE_ID');
  const gateway=createMediaRetryGateway({
   projectUrl:process.env.MIDAN_MEDIA_RETRY_DB_URL,
   bridgeKey:process.env.MIDAN_MEDIA_RETRY_BRIDGE_KEY
  });
  const id={channel:'midan_qa_test',sourceId:Date.now(),targetMessageId:messageId};
  queueStatus=await gateway.enqueue(id,{schema:4,source:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
   channel:id.channel,sourceId:id.sourceId,destination:channel,targetMessageId:messageId,caption:'اختبار تقني'});
  if(queueStatus?.accepted!==true)throw Error('ENQUEUE_FAILED');
  const claim=await gateway.claim(180);
  if(!claim||claim.jobKey!==gateway.keyFor(id))throw Error('QUEUE_CLAIM_MISMATCH');
  let edited;
  try{
   edited=await bot('editMessageMedia',{chat_id:channel,message_id:messageId,
    media:{type:'video',media:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
     caption:'اختبار تقني مؤقت — سيُحذف تلقائياً.',supports_streaming:true}});
  }catch(e){await gateway.fail(claim.jobKey,claim.leaseToken,e).catch(()=>{});throw e;}
  videoFileId=edited?.video?.file_id||null;
  if(typeof videoFileId!=='string'||videoFileId.length<8)throw Error('NATIVE_VIDEO_NOT_CONFIRMED');
  const marked=await gateway.complete(claim.jobKey,claim.leaseToken,{messageId,videoFileId});
  if(marked!==true)throw Error('QUEUE_COMPLETION_FAILED');
  success=true;
 }catch(e){error=String(e?.message||e).slice(0,180);}
 finally{
  if(messageId)for(let attempt=0;attempt<3&&!deleted;attempt++){
   try{await bot('deleteMessage',{chat_id:channel,message_id:messageId});deleted=true;}
   catch(e){error=(error?error+'; ':'')+'CLEANUP_'+String(e?.message||e).slice(0,95);}
  }
 }
 return res.status(success&&deleted?200:500).json({ok:success&&deleted,videoConfirmed:!!videoFileId,
  queueStored:queueStatus?.accepted===true,queueCompleted:success,deleted,messageId,
  source:'mdn-cc0-video',error});
};
