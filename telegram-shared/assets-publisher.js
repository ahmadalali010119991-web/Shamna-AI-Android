'use strict';
/**
 * Two independent Telegram photos at 09:00 Asia/Damascus.
 * Gold first; fuel immediately next. Each has its own atomic Supabase
 * delivery key, permitting a failed second photo to be retried safely.
 * Currency rates 07/11/15/19 are completely untouched.
 */
const crypto=require('node:crypto');
const rates=require('./rates-publisher');
const prices=require('./assets-feed');
const images=require('./hasibat-assets-image');
const TIPS=require('./hasibat-image').messages;
function permitted(now){
 const p=rates.stamp(now);
 // Owner-authorized single preview on 2026-11-11 from 07:00 to 07:59 Damascus.
 // Distinct once-key prevents repeats; never modifies regular 09:00 cadence.
 if(p.date==='2026-11-11'&&p.hour===7)return {date:p.date,slot:'PREVIEW'};
 return p.hour===9&&p.minute<=20?{date:p.date,slot:'09'}:null;
}
function jsonString(value){return JSON.stringify(value).slice(0,600)}
async function sendPhoto(png,kind,date,meta){
 const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chat)throw Error('Bot identity or channel not configured');
 const isGold=kind==='gold';
 const caption=isGold?
  '🪙 أسعار الذهب في سوريا — حاسبة الليرة\nعيارات 24، 22، 21، 18، 14 · شراء ومبيع · ليرة ودولار\nالأسعار استرشادية، وقت الجلب: '+meta.stamp+'\n#أسعار_الذهب #حاسبة_الليرة':
  '⛽ أسعار المحروقات في سوريا — حاسبة الليرة\nبنزين 95 و90، المازوت والغاز المنزلي\nتاريخ السعر المنشور: '+meta.sourceUpdatedAt+
  (meta.stale?'\n⚠️ تنبيه: السعر المنشور قديم، وليس سعرًا لحظيًا.':'')+
  '\n#أسعار_المحروقات #حاسبة_الليرة';
 const form=new FormData();
 form.append('chat_id',chat);
 form.append('photo',new Blob([png],{type:'image/png'}),'Hasibat-'+(isGold?'Gold':'Fuel')+'-'+date+'.png');
 form.append('caption',caption);
 const r=await fetch('https://api.telegram.org/bot'+token+'/sendPhoto',
  {method:'POST',body:form,signal:AbortSignal.timeout(35000)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.ok!==true||!Number.isInteger(data.result?.message_id))
  throw Error('Telegram rejected photo '+r.status+': '+String(data.description||'no receipt').slice(0,140));
 return data.result;
}
async function alreadySent(key){
 const d=await rates.stateCall('read',key);
 return Boolean(d?.record?.completed_at);
}
async function publishOne({kind,now,price,usdSell}){
 const slot=permitted(now);
 if(!slot)return {status:'skipped',kind,reason:'outside 09:00 Damascus slot'};
 const key=slot.slot==='PREVIEW'?'once/rates:2026-11-11-manual-preview-'+kind+'-hasibat-v1':'once/rates:'+slot.date+'-09-'+kind+'-hasibat-v1';
 if(await alreadySent(key))return {status:'duplicate',kind};
 const next=await rates.chooseNext();
 if(!TIPS.includes(next.text))throw Error('Owner awareness validation failed');
 const snap=kind==='gold'?
  images.snapshotGold(price,next.text,now):
  images.snapshotFuel(price,usdSell,next.text,now);
 const image=await images.render(snap);
 if(image.buffer.length>9_000_000)throw Error(kind+' PNG exceeds Telegram photo size safety limit');
 const claim=await rates.stateCall('claim',key,{}, {lease_seconds:300});
 if(!claim.ok)return {status:'duplicate',kind,reason:claim.status};
 const lease=claim.record?.lease_id;
 if(!lease)throw Error('Atomic '+kind+' publish lease was not returned');
 let receipt;
 try{
  receipt=await sendPhoto(image.buffer,kind,slot.date,{
   stamp:snap.updated,sourceUpdatedAt:price.sourceUpdatedAt,stale:price.stale
  });
 }catch(e){
  // An explicit Telegram rejection is confirmed non-delivery. A timeout
  // is ambiguous: leave the claim in place to avoid blind duplicate sends.
  if(/^Telegram rejected photo /.test(e.message))
   await rates.stateCall('release',key,{}, {lease_id:lease}).catch(()=>{});
  throw e;
 }
 const record={message_id:receipt.message_id,chat_id:String(receipt.chat.id),
  sent_at:new Date().toISOString(),kind,date:slot.date,awarenessIndex:next.number,
  imageSha256:crypto.createHash('sha256').update(image.buffer).digest('hex'),
  imageBytes:image.buffer.length,
  sourceDate:kind==='fuel'?price.sourceUpdatedAt:slot.date,
  oldSource:kind==='fuel'?price.stale:false};
 let confirmed=false,last;
 for(let i=0;i<3;i++){
  try{
   const r=await rates.stateCall('complete',key,record,{lease_id:lease});
   if(r.ok){confirmed=true;break}
   last=new Error('lease conflict '+r.status);
  }catch(e){last=e}
  if(i<2)await new Promise(res=>setTimeout(res,600*(i+1)));
 }
 if(!confirmed)throw Error('Photo was delivered but receipt not committed: '+(last?.message||'unknown'));
 const stored=await rates.stateCall('write','state/hasibat-telegram-rotation-v1',next.next,
   next.previousVersion?{expected_updated_at:next.previousVersion}:{});
 if(!stored.ok)console.error('Awareness rotation CAS conflict after successful '+kind+' send');
 return {status:'sent',kind,messageId:receipt.message_id,bytes:image.buffer.length,
  dimensions:[image.width,image.height],tipIndex:next.number+1,
  priceDate:kind==='fuel'?price.sourceUpdatedAt:undefined,oldSource:kind==='fuel'?price.stale:undefined};
}
async function run({now=new Date()}={}){
 if(!permitted(now))return {status:'skipped',reason:'outside 09:00 Asia/Damascus',items:[]};
 const date=rates.stamp(now).date;
 const preview=permitted(now).slot==='PREVIEW';
 const goldKey=preview?'once/rates:2026-11-11-manual-preview-gold-hasibat-v1':'once/rates:'+date+'-09-gold-hasibat-v1';
 const fuelKey=preview?'once/rates:2026-11-11-manual-preview-fuel-hasibat-v1':'once/rates:'+date+'-09-fuel-hasibat-v1';
 const [gSent,fSent]=await Promise.all([alreadySent(goldKey),alreadySent(fuelKey)]);
 if(gSent&&fSent)return {status:'duplicate',items:[]};
 let goldPrice=null,fuelPrice=null,usdSell=null;
 // Prepare BOTH snapshots before sending the first message; a failed quote
 // prevents partially updating the channel with outdated/mismatched data.
 const tasks=[];
 if(!gSent)tasks.push(prices.gold().then(v=>{goldPrice=v}));
 if(!fSent)tasks.push(prices.fuel().then(v=>{fuelPrice=v}));
 if(!fSent)tasks.push(fetch('https://dallalna-telegram-bridge.vercel.app/api/rates-preview?mode=metadata',
  {cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async r=>{
   if(!r.ok)throw Error('Currency rate endpoint HTTP '+r.status);
   const d=await r.json();const row=d.rows?.find(x=>x.code==='USD');
   if(d.ok!==true||!row||Number(d.ageSeconds)>900)throw Error('USD sell quote stale or absent');
   usdSell=prices.safeNumber(row.sellNew);
  }));
 await Promise.all(tasks);
 const items=[];
 if(!gSent)items.push(await publishOne({kind:'gold',now,price:goldPrice,usdSell:null}));
 else items.push({kind:'gold',status:'duplicate'});
 // A concurrent scheduler may hold the gold lease. Never let fuel overtake
 // that gold message before the Telegram receipt has been confirmed.
 if(!(await alreadySent(goldKey)))
  return {status:'gold-pending',date,items};
 if(!fSent)items.push(await publishOne({kind:'fuel',now,price:fuelPrice,usdSell}));
 else items.push({kind:'fuel',status:'duplicate'});
 return {status:'ok',date,items};
}
module.exports={permitted,run,publishOne,alreadySent};
