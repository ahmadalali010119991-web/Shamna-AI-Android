'use strict';
/**
 * A native Node Canvas port of the application's share-prices.js from
 * Hasibat v1.8.23 (same 1080px dimensions, gradients, cards, labels, 53 tips).
 * Independent input validation is in assets-feed.js; no new pricing formulas.
 */
const {createCanvas,GlobalFonts,loadImage}=require('@napi-rs/canvas');
const fs=require('node:fs');
const app=require('./hasibat-image');
const feed=require('./assets-feed');
const LOGO='https://hasibat-al-lira-apk.vercel.app/assets/hasibat-icon-20261108.png';
const AR_FONT='https://raw.githubusercontent.com/google/fonts/main/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf';
let initialized,logoPromise;
function valid(n){return Number.isFinite(n)&&n>0}
function format(n,d=2){return Number(n).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:0})}
async function setupFont(){
 if(!initialized)initialized=(async()=>{
  try{
   const r=await fetch(AR_FONT,{signal:AbortSignal.timeout(11000)});
   if(!r.ok)throw Error('font '+r.status);
   const b=Buffer.from(await r.arrayBuffer());
   if(b.length<10000||b.length>3e6)throw Error('font size invalid');
   GlobalFonts.register(b,'HasibatArabic');
  }catch(e){console.warn('Font fallback:',e.message)}
 })();
 return initialized;
}
async function appLogo(){
 if(!logoPromise)logoPromise=(async()=>{
  const r=await fetch(LOGO,{signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('logo '+r.status);
  const b=Buffer.from(await r.arrayBuffer());
  if(b.length<2000||b.length>800000)throw Error('logo size invalid');
  return loadImage(b);
 })().catch(e=>{console.warn('Logo fallback:',e.message);return null});
 return logoPromise;
}
function rounded(ctx,x,y,w,h,r){
 ctx.beginPath();
 if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
 else{
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+r);ctx.closePath();
 }
}
function text(ctx,value,x,y,size,color,weight,align='right',maxWidth){
 ctx.save();ctx.direction=align==='left'?'ltr':'rtl';ctx.textAlign=align;
 ctx.textBaseline='middle';ctx.fillStyle=color;ctx.font=(weight||700)+' '+size+'px HasibatArabic,Tahoma,Arial,sans-serif';
 ctx.fillText(String(value),x,y,...(maxWidth?[maxWidth]:[]));ctx.restore();
}
function wrap(ctx,value,maxWidth,size){
 const lines=[];ctx.save();ctx.font='700 '+size+'px HasibatArabic,Tahoma,Arial,sans-serif';
 for(const para of String(value).split(/\r?\n/)){
  const words=para.trim().split(/\s+/).filter(Boolean);
  if(!words.length){lines.push('');continue}
  let current='';
  for(const word of words){
   const next=current?current+' '+word:word;
   if(current&&ctx.measureText(next).width>maxWidth){lines.push(current);current=word}
   else current=next;
  }
  if(current)lines.push(current);
 }
 ctx.restore();return lines;
}
function snapshotGold(data,tip,now=new Date()){
 if(!app.messages.includes(tip))throw Error('Unapproved owner tip');
 return {kind:'gold',title:'أسعار الذهب في سوريا',
  subtitle:'سعر الغرام الواحد · شراء ومبيع دون مصنعية',
  created:app.timeLabel(now),updated:app.timeLabel(new Date(data.checkedAt)),
  source:'أسعار الذهب المعتمدة في حاسبة الليرة',stale:false,awareness:{text:tip},
  rows:feed.GOLD_KARATS.map(k=>({
   key:k,title:'عيار '+k,tag:k+'K',
   buy:data['g'+k].sypBuy,sell:data['g'+k].sypSell,
   usdBuy:data['g'+k].usdBuy,usdSell:data['g'+k].usdSell
  })),
  footnote:'الأسعار استرشادية للغرام وقد تختلف حسب المدينة والمصنعية.'
 }
}
function snapshotFuel(data,usdSell,tip,now=new Date()){
 if(!app.messages.includes(tip))throw Error('Unapproved owner tip');
 if(!valid(usdSell))throw Error('Cannot convert actual Syrian fuel prices to USD without current USD quote');
 return {kind:'fuel',title:'أسعار المحروقات في سوريا',
 subtitle:'بنزين 95 و90 · مازوت · الغاز المنزلي',
 created:app.timeLabel(now),updated:app.timeLabel(new Date(data.checkedAt)),
 source:data.source==='https://sp-today.com/energy'?'SP Today':'SYPNow (احتياطي)',
 sourceUpdated:data.sourceUpdatedAt,stale:data.stale,awareness:{text:tip},
 rows:data.rows.map(row=>({
  title:row.label,tag:row.id==='lpg10kg'?'10 KG':row.id==='diesel'?'DIESEL':row.id==='gasoline95'?'95':'90',
  unit:row.unit,syp:row.newSyp,old:row.newSyp*100,usd:row.newSyp/usdSell
 })),
 footnote:data.stale?'تنبيه: تاريخ السعر قديم أو غير مؤكّد؛ ليست أسعارًا لحظية.':'تاريخ المصدر يحدد سريان الأسعار؛ الدولار قيمة تقريبية.'
 }
}
async function render(snapshot){
 if(!['gold','fuel'].includes(snapshot?.kind))throw Error('Unexpected renderer mode');
 if(!app.messages.includes(snapshot?.awareness?.text))throw Error('Unknown owner awareness text');
 await setupFont();
 const canvas=createCanvas(1080,1);
 const measure=canvas.getContext('2d');
 const messageLines=wrap(measure,snapshot.awareness.text,792,23),lineHeight=34;
 const boxH=Math.max(90,57+messageLines.length*lineHeight);
 const rowH=snapshot.kind==='gold'?212:199;
 const begin=401,end=begin+snapshot.rows.length*rowH,H=end+346+boxH;
 canvas.height=H;
 const ctx=canvas.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,0,H);
 bg.addColorStop(0,'#081f17');bg.addColorStop(.56,'#143e2c');bg.addColorStop(1,'#061b12');
 ctx.fillStyle=bg;ctx.fillRect(0,0,1080,H);
 for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(1080,0,140+i*80,0,Math.PI*2);
  ctx.strokeStyle='rgba(237,205,123,'+(0.12-i*.017)+')';ctx.lineWidth=2;ctx.stroke()}
 rounded(ctx,37,31,1006,H-62,33);ctx.strokeStyle='#a58b51';ctx.lineWidth=2;ctx.stroke();
 rounded(ctx,55,49,970,H-99,27);ctx.strokeStyle='rgba(255,228,151,.27)';ctx.lineWidth=1;ctx.stroke();
 ctx.beginPath();ctx.arc(540,125,43,0,Math.PI*2);ctx.fillStyle='#d6b567';ctx.fill();
 text(ctx,'ل',540,127,47,'#0c3022',900,'center');
 const logo=await appLogo();
 if(logo){rounded(ctx,495,80,90,90,19);ctx.save();ctx.clip();ctx.drawImage(logo,495,80,90,90);ctx.restore()}
 text(ctx,'حاسبة الليرة السورية',540,204,49,'#fff7e7',900,'center');
 text(ctx,snapshot.title,540,262,34,'#f0d28d',800,'center');
 text(ctx,snapshot.subtitle,540,306,23,'#d4e4d8',750,'center',920);
 ctx.fillStyle='#c8a45d';ctx.fillRect(112,345,856,2);
 text(ctx,'أسعار موثقة من التطبيق · تاريخ الإنشاء في أسفل الصورة',942,378,20,'#f5dc9e',700,'right');
 snapshot.rows.forEach((r,index)=>{
  const y=begin+index*rowH;
  rounded(ctx,95,y,889,rowH-13,23);ctx.fillStyle=index%2===0?'#174331':'#103a2b';ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle='#6c8b69';ctx.stroke();
  rounded(ctx,836,y+18,119,39,17);ctx.fillStyle='#493c22';ctx.fill();
  text(ctx,r.tag,895,y+40,19,'#ffe2a0',800,'center');
  text(ctx,r.title,803,y+45,29,'#ffffff',850,'right',610);
  if(snapshot.kind==='gold'){
   text(ctx,'الليرة السورية الجديدة',801,y+88,18,'#e6eedb',650,'right');
   text(ctx,'شراء: '+format(r.buy,2)+'  |  مبيع: '+format(r.sell,2),801,y+122,27,'#fef8ea',850,'right',700);
   text(ctx,'بالدولار · شراء: $'+format(r.usdBuy,2)+'  |  مبيع: $'+format(r.usdSell,2),801,y+169,22,'#deeadc',700,'right',710);
  }else{
   text(ctx,'لكل '+r.unit,801,y+86,19,'#e1eedd',650,'right');
   text(ctx,format(r.syp,2)+' ل.س جديدة',800,y+130,37,'#ffffff',900,'right',710);
   const usd=valid(r.usd)?'$'+format(r.usd,2)+' تقريبي':'دولار غير متاح';
   text(ctx,format(r.old,2)+' ل.س قديمة  ·  '+usd,800,y+172,20,'#dfe8dc',700,'right',710);
  }
 });
 const base=end+21;ctx.fillStyle='#c9a45e';ctx.fillRect(105,base,869,2);
 const lines=['وقت إنشاء الصورة: '+snapshot.created,
  'آخر تحديث ناجح للبيانات: '+snapshot.updated,
  ...(snapshot.kind==='fuel'?['تاريخ أسعار المحروقات المنشورة: '+snapshot.sourceUpdated]:[]),
  'مصدر الأسعار: '+snapshot.source,
  snapshot.stale?'تنبيه: بيانات محفوظة أو غير حديثة، وليست سعرًا لحظيًا.':'الأسعار المتاحة وقت إنشاء الصورة'];
 lines.forEach((line,i)=>text(ctx,line,947,base+33+i*34,i===0?21:19,
   i===0?'#fff5d7':'#d6ead8',750,'right',820));
 const messageTop=base+195;
 rounded(ctx,97,messageTop,887,boxH,17);ctx.fillStyle='#16462f';ctx.fill();
 ctx.strokeStyle='#c5a666';ctx.lineWidth=1.4;ctx.stroke();
 text(ctx,'رسالة نافعة',944,messageTop+27,19,'#ead08f',850,'right');
 messageLines.forEach((line,i)=>text(ctx,line,938,messageTop+61+i*lineHeight,23,'#ffffff',700,'right',800));
 const noteY=messageTop+boxH+30;
 text(ctx,snapshot.footnote,943,noteY,17,'#dfebd9',650,'right',817);
 const output=canvas.toBuffer('image/png');
 if(output.length<30000||output.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
  throw Error('Failed to render original Hasibat price PNG');
 if(output.readUInt32BE(16)!==1080||output.readUInt32BE(20)!==H)throw Error('Unexpected PNG dimensions');
 return {buffer:output,width:1080,height:H};
}
module.exports={render,snapshotGold,snapshotFuel,wrap};
