'use strict';
const crypto=require('node:crypto');
const B=require('@vercel/blob');
const image=require('./hasibat-image');
const ZONE='Asia/Damascus';
const ROTATION='hasibat/telegram/image-awareness-rotation-v1.json';
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
async function readJSON(path){
  const r=await B.get(path,{access:'private'});
  if(!r||r.statusCode!==200)return null;
  return JSON.parse(await new Response(r.stream).text());
}
async function chooseNext(){
  let state=await readJSON(ROTATION).catch(e=>{throw new Error('Cannot read awareness rotation: '+e.message)});
  if(!isGoodRotation(state))state={order:randomShuffle(),index:0,last:-1};
  if(state.index===53)state={order:randomShuffle(state.last),index:0,last:state.last};
  const number=state.order[state.index];
  return {number,text:image.messages[number],next:{order:state.order,index:state.index+1,last:number}};
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
  if(!slot)return {status:'skipped',reason:'outside exact 07:00/19:00 Damascus publishing window'};
  const key=slot.date+'-'+slot.slot;
  const path='hasibat/telegram/sent-'+key+'.json';
  if(await readJSON(path))return {status:'duplicate',slot:slot.slot,date:slot.date};
  const pick=await chooseNext();
  // Fail before creating a lock if rates are stale or image generation fails.
  const rates=await image.freshRates();
  const snapshot=image.makeSnapshot(rates,pick.text,now);
  const img=await image.generatePng(snapshot);
  if(img.buffer.length>9_000_000)throw new Error('Telegram photo would exceed 9 MB');
  // Create-only lock prevents double posts across Cron and GitHub five-minute fallback.
  try{
    await B.put(path,JSON.stringify({state:'sending',at:now.toISOString(),message:pick.number}),
      {access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:false});
  }catch(e){
    if(/already exists|overwrite|409|conflict/i.test(e?.message||''))return {status:'duplicate',slot:slot.slot,date:slot.date};
    throw e;
  }
  try{
    const receipt=await sendTelegram(img.buffer,snapshot,slot.slot,slot.date);
    const record={state:'sent',messageId:receipt.message_id,awarenessIndex:pick.number,
      at:new Date().toISOString(),slot:slot.slot,date:slot.date,
      imageSha256:crypto.createHash('sha256').update(img.buffer).digest('hex'),
      imageBytes:img.buffer.length,source:'Hasibat 1.8.21 Canvas renderer',ratesAgeSeconds:rates.ageSeconds};
    // Keep the sent marker even if the acknowledgement storage fails (no double send).
    await B.put(path,JSON.stringify(record),
      {access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true});
    await B.put(ROTATION,JSON.stringify(pick.next),
      {access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true});
    return {status:'sent',slot:slot.slot,date:slot.date,messageId:receipt.message_id,
      bytes:img.buffer.length,width:img.width,height:img.height,
      awarenessNumber:pick.number+1,ratesAgeSeconds:rates.ageSeconds};
  }catch(e){
    // If Telegram may have accepted a photo before a network timeout, keep the lock
    // rather than risk duplicate messages; operator can investigate/recover manually.
    if(/Telegram rejected photo/i.test(e.message)){
      await B.del(path).catch(()=>{});
    }
    throw e;
  }
}
module.exports={ZONE,stamp,allowedSlot,randomShuffle,isGoodRotation,chooseNext,run};
