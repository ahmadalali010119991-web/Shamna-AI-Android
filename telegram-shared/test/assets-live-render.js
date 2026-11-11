'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const feed=require('../assets-feed'),image=require('../hasibat-assets-image');
const app=require('../hasibat-image');
(async()=>{
 const [gold,fuel]=await Promise.all([feed.gold(),feed.fuel()]);
 const r=await fetch('https://dallalna-telegram-bridge.vercel.app/api/rates-preview?mode=metadata',
 {signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('USD quotes unavailable');
 const meta=await r.json();
 const sell=Number(meta.rows.find(x=>x.code==='USD')?.sellNew);
 if(!Number.isFinite(sell)||sell<=0)throw Error('USD sell missing');
 const samples=[
  ['gold',image.snapshotGold(gold,app.messages[0])],
  ['fuel',image.snapshotFuel(fuel,sell,app.messages[1])]
 ];
 for(const [kind,snap] of samples){
  const {buffer,width,height}=await image.render(snap);
  fs.writeFileSync('/tmp/hasibat-0900-'+kind+'.png',buffer);
  console.log('PNG_PASS',kind,width,height,buffer.length,
   crypto.createHash('sha256').update(buffer).digest('hex').slice(0,20),
   kind==='fuel'?'PUBLISHED_DATE='+fuel.sourceUpdatedAt+';STALE='+fuel.stale:'KARATS='+Object.keys(gold).filter(x=>x.startsWith('g')).length);
 }
})().catch(e=>{console.error('PNG_FAIL',String(e.stack||e));process.exitCode=1});
