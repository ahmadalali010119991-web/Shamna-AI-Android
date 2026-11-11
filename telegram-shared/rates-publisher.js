'use strict';
const crypto=require('node:crypto');
const image=require('./hasibat-image');
const ZONE='Asia/Damascus';
const ROTATION='state/hasibat-telegram-rotation-v1';
const STATE_URL='https://ftzmeimurgsqzvmcahhs.supabase.co/functions/v1/telegram-bridge-state';
function stamp(t){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
    .formatToParts(t).map(x=>[x.type,x.value]));
  return {date:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
function allowedSlot(t,requestedSlot){
  const v=stamp(t);
  if(![7,19].includes(v.hour)||v.minute>20)return null;
  const slot=v.hour===7?'07':'19';
  if(requestedSlot&&requestedSlot!==slot)return null;
  return {...v,slot};
}
function randomShuffle(last=-1){
  const result=image.messages.map((_,i)=>i);
  for(let i=result.length-1;i>0;i--){
    const j=crypto.randomInt(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  if(result[0]===last&&result.length>1)
    [result[0],result[1]]=[result[1],result[0]];
  return result;
}
function isGoodRotation(v){
  return !!(v&&Array.isArray(v.order)&&v.order.length===53&&
    new Set(v.order).size===53&&v.order.every(n=>Number.isInteger(n)&&n>=0&&n<53)&&
    Number.isInteger(v.index)&&v.index>=0&&v.index<=53&&
    Number.isInteger(v.last)&&v.last>=-1&&v.last<53);
}
async function stateCall(op,key,value={},options={}){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)throw new Error('Bot identity token not configured');
  const read=op==='read';
  const url=new URL(STATE_URL);
  if(read){url.searchParams.set('op',op);url.searchParams.set('key',key)}
  const resp=await fetch(url,{method:read?'GET':'POST',
    headers:{authorization:'Bearer '+token,...(read?{}:{'content-type':'application/json'})},
    body:read?undefined:JSON.stringify({op,key,value,...options}),
    signal:AbortSignal.timeout(17000),cache:'no-store'});
  const out=await resp.json().catch(()=>({error:'Unreadable state response'}));
  if(resp.status===409)return {...out,ok:false,conflict:true};
  if(!resp.ok)throw new Error('Telegram state HTTP '+resp.status+': '+String(out.error||'unknown').slice(0,100));
  return out;
}
async function readState(key){
  const r=await stateCall('read',key);
  return r.found?r.record:null;
}
async function chooseNext(){
  const prior=await readState(ROTATION);
  let state=prior?.value;
  if(!isGoodRotation(state))state={order:randomShuffle(),index:0,last:-1};
  if(state.index===53)state={order:randomShuffle(state.last),index:0,last:state.last};
  const number=state.order[state.index];
  return {number,text:image.messages[number],
    previousVersion:prior?.updated_at||null,
    next:{order:state.order,index:state.index+1,last:number}};
}
async function sendTelegram(png,snapshot,slot,date){
  const token=process.env.TELEGRAM_BOT_TOKEN,channel=process.env.TELEGRAM_CHAT_ID;
  if(!token||!channel)throw new Error('Missing Telegram bot configuration');
  const caption=['💱 أسعار الصرف — حاسبة الليرة السورية',
    slot==='07'?'🌅 نشرة الساعة 7:00 صباحًا':'🌆 نشرة الساعة 7:00 مساءً',
    '💵 نتائج تحويل 1 دولار أمريكي — السعر الوسطي',
    '🕒 تحديث الأسعار: '+snapshot.checkedAt+' (بتوقيت دمشق)',
    '#حاسبة_الليرة #أسعار_العملات'].join('\n');
  const data=new FormData();
  data.append('chat_id',channel);
  data.append('photo',new Blob([png],{type:'image/png'}),'Hasibat-AlLira-'+date+'-'+slot+'.png');
  data.append('caption',caption);
  const endpoint='https://api.telegram.org/bot'+token+'/sendPhoto';
  const response=await fetch(endpoint,{method:'POST',body:data,signal:AbortSignal.timeout(28000)});
  const receipt=await response.json().catch(()=>({}));
  if(!response.ok||receipt.ok!==true||!receipt.result?.message_id)
    throw new Error('Telegram rejected photo '+response.status+': '+String(receipt.description||'no receipt').slice(0,130));
  return receipt.result;
}
async function run({now=new Date(),requestedSlot}={}){
  const slot=allowedSlot(now,requestedSlot);
  if(!slot)return {status:'skipped',reason:'outside 07:00/19:00 Damascus schedule'};
  const once='once/rates:'+slot.date+'-'+slot.slot+'-hasibat-image-v1';
  const existing=await readState(once);
  if(existing?.completed_at)return {status:'duplicate',slot:slot.slot,date:slot.date};
  const rates=await image.freshRates();
  const pick=await chooseNext();
  const snap=image.makeSnapshot(rates,pick.text,now);
  const png=await image.generatePng(snap);
  if(png.buffer.length>9_000_000)throw new Error('Telegram PNG exceeds 9 MB');
  const claim=await stateCall('claim',once,{}, {lease_seconds:300});
  if(!claim.ok)return {status:'duplicate',slot:slot.slot,date:slot.date,
    reason:claim.status||'already claimed'};
  const lease_id=claim.record?.lease_id;
  if(!lease_id)throw new Error('State lease not returned');
  let receipt;
  try{receipt=await sendTelegram(png.buffer,snap,slot.slot,slot.date)}
  catch(e){
    // Rejects with known non-delivery can safely release. Ambiguous network
    // timeouts retain lease and require reconciliation (never blindly replay).
    if(/^Telegram rejected photo /.test(e.message))
      await stateCall('release',once,{}, {lease_id}).catch(()=>{});
    throw e;
  }
  const record={message_id:receipt.message_id,
    chat_id:String(receipt.chat.id),at:new Date().toISOString(),
    slot:slot.slot,date:slot.date,awarenessIndex:pick.number,
    imageSha256:crypto.createHash('sha256').update(png.buffer).digest('hex'),
    imageBytes:png.buffer.length,ratesAgeSeconds:rates.ageSeconds};
  // Receipt is committed while the 300-sec lease belongs to us.
  let finished=false,lastError;
  for(let i=0;i<3;i++){
    try{
      const done=await stateCall('complete',once,record,{lease_id});
      if(done.ok){finished=true;break}
      lastError=new Error('Telegram receipt lease conflict: '+done.status);
    }catch(e){lastError=e}
    if(i<2)await new Promise(r=>setTimeout(r,500*(i+1)));
  }
  if(!finished)throw new Error('Telegram accepted image but state receipt could not be committed: '+lastError?.message);
  const saved=await stateCall('write',ROTATION,pick.next,
    pick.previousVersion?{expected_updated_at:pick.previousVersion}:{});
  if(!saved.ok)throw new Error('Telegram image delivered but awareness rotation state conflicted');
  return {status:'sent',slot:slot.slot,date:slot.date,messageId:receipt.message_id,
    bytes:png.buffer.length,width:png.width,height:png.height,
    awarenessNumber:pick.number+1,ratesAgeSeconds:rates.ageSeconds};
}
module.exports={ZONE,stamp,allowedSlot,randomShuffle,isGoodRotation,chooseNext,run,stateCall};
