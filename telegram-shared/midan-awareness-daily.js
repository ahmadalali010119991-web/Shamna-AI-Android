'use strict';
/**
 * Once per day at 20:30 Asia/Damascus: one of the original 53 unmodified
 * owner-provided 1254×1254 PNGs, with its matching reviewed caption.
 * Every photo appears once in a randomized 53-post cycle.
 */
const crypto=require('node:crypto');
const rates=require('./rates-publisher');
const manifest=require('./midan-awareness-manifest.json');
const ROTATION='state/midan-awareness-53-rotation-v1';
const PREFIX='https://dallalna-telegram-bridge.vercel.app/awareness/';
const N=53;
if(manifest.length!==N||new Set(manifest.map(x=>x.id)).size!==N||
   manifest.some((v,i)=>v.id!==i+1||v.file!=='Midan_AlKhabar_Message_'+String(i+1).padStart(2,'0')+'.png'||
     !v.caption||v.caption.length>1024||!/^[0-9a-f]{64}$/.test(v.sha256)))
  throw Error('Invalid original Midan awareness manifest');
function windowFor(now=new Date()){
 const d=rates.stamp(now);
 if(d.hour!==20||d.minute<30||d.minute>49)return null;
 return {date:d.date,slot:'20:30',zone:'Asia/Damascus'};
}
function shuffle(last=-1){
 const a=Array.from({length:N},(_,i)=>i);
 for(let i=N-1;i>0;i--){
  const j=crypto.randomInt(i+1);
  [a[i],a[j]]=[a[j],a[i]];
 }
 if(last>=0&&a[0]===last)[a[0],a[1]]=[a[1],a[0]];
 return a;
}
function validRotation(s){
 return Boolean(s&&Array.isArray(s.order)&&s.order.length===N&&
   new Set(s.order).size===N&&s.order.every(n=>Number.isInteger(n)&&n>=0&&n<N)&&
   Number.isInteger(s.index)&&s.index>=0&&s.index<=N&&
   Number.isInteger(s.last)&&s.last>=-1&&s.last<N);
}
async function nextChoice(){
 const r=await rates.stateCall('read',ROTATION),prior=r.found?r.record:null;
 let state=prior?.value;
 if(!validRotation(state))state={order:shuffle(),index:0,last:-1};
 if(state.index===N)state={order:shuffle(state.last),index:0,last:state.last};
 const number=state.order[state.index];
 return {number,priorVersion:prior?.updated_at||null,
   next:{order:state.order,index:state.index+1,last:number}};
}
async function downloadOriginal(index){
 const item=manifest[index];if(!item)throw Error('Unknown source image');
 const r=await fetch(PREFIX+item.file,{signal:AbortSignal.timeout(24000),cache:'no-store'});
 if(!r.ok)throw Error('Owner image not available: '+item.file+' HTTP '+r.status);
 const len=Number(r.headers.get('content-length')||0);
 if(len>3_000_000)throw Error('Unexpected image response length');
 const b=Buffer.from(await r.arrayBuffer());
 if(b.length!==item.bytes||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
    b.readUInt32BE(16)!==1254||b.readUInt32BE(20)!==1254||
    crypto.createHash('sha256').update(b).digest('hex')!==item.sha256)
   throw Error('Original image has failed integrity check: '+item.file);
 return b;
}
async function send(index,image){
 const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chat)throw Error('Bot identity unavailable');
 const item=manifest[index];
 const f=new FormData();
 f.append('chat_id',chat);
 f.append('photo',new Blob([image],{type:'image/png'}),item.file);
 f.append('caption',item.caption);
 const r=await fetch('https://api.telegram.org/bot'+token+'/sendPhoto',
  {method:'POST',body:f,signal:AbortSignal.timeout(40000)});
 const obj=await r.json().catch(()=>({}));
 if(!r.ok||obj.ok!==true||!Number.isInteger(obj.result?.message_id))
   throw Error('Telegram declined awareness photo '+r.status+': '+String(obj.description||'').slice(0,130));
 return obj.result;
}
async function run({now=new Date()}={}){
 const slot=windowFor(now);if(!slot)return {status:'skipped',reason:'Outside 20:30 Damascus window'};
 const key='once/midan-awareness-53:'+slot.date;
 const previous=await rates.stateCall('read',key);
 if(previous?.record?.completed_at)return {status:'duplicate',date:slot.date};
 const choice=await nextChoice();
 const img=await downloadOriginal(choice.number); // validate BEFORE claiming dispatch.
 const lock=await rates.stateCall('claim',key,{}, {lease_seconds:300});
 if(!lock.ok)return {status:'duplicate',date:slot.date};
 const lease_id=lock.record?.lease_id;
 if(!lease_id)throw Error('Missing daily awareness lease');
 let receipt;
 try{receipt=await send(choice.number,img)}
 catch(e){
   // Unambiguous Telegram rejection can be released. Network timeout is
   // ambiguous: retain lease to prevent double publication.
   if(/^Telegram declined awareness photo /.test(e.message))
     await rates.stateCall('release',key,{}, {lease_id}).catch(()=>{});
   throw e;
 }
 const record={date:slot.date,message_id:receipt.message_id,
    chat_id:String(receipt.chat.id),image:manifest[choice.number].file,
    imageIndex:choice.number+1,
    sha256:manifest[choice.number].sha256,sentAt:new Date().toISOString()};
 let completed=false;
 for(let i=0;i<3;i++){
  try{const a=await rates.stateCall('complete',key,record,{lease_id});if(a.ok){completed=true;break}}
  catch(e){console.error('Awareness receipt retry',String(e.message).slice(0,80))}
  if(i<2)await new Promise(resolve=>setTimeout(resolve,500*(i+1)));
 }
 if(!completed)throw Error('Image delivered but receipt could not be committed; manual reconciliation required');
 const saved=await rates.stateCall('write',ROTATION,choice.next,
  choice.priorVersion?{expected_updated_at:choice.priorVersion}:{});
 if(!saved.ok)throw Error('Image delivered, rotation write failed; do not blindly repeat');
 return {status:'sent',date:slot.date,messageId:receipt.message_id,imageIndex:choice.number+1};
}
module.exports={windowFor,shuffle,validRotation,run,downloadOriginal,manifest};
