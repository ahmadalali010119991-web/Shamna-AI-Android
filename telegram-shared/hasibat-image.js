'use strict';
/**
 * Server adapter for the actual 1.8.21 Hasibat Canvas image generator.
 * Coordinates, colors, formatNumber, readableResult, row order, awareness
 * wrapping and output dimensions are carried over from assets/share-results.js
 * and assets/index.html of the signed Hasibat 1.8.21 APK.
 * No separate image template and no altered exchange-rate arithmetic.
 */
const {createCanvas,GlobalFonts,loadImage}=require('@napi-rs/canvas');
const messages=require('./awareness-53.json');
const RATE_META='https://dallalna-telegram-bridge.vercel.app/api/rates-preview?mode=metadata';
const LOGO='https://hasibat-al-lira-apk.vercel.app/assets/hasibat-icon-20261108.png';
const AR_FONT='https://raw.githubusercontent.com/google/fonts/main/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf';
let initialized=null,logoPromise=null;
function requireValid(ok,reason){if(!ok)throw new Error(reason)}
function asNumber(v){const x=Number(String(v).replace(/,/g,''));if(!Number.isFinite(x)||x<=0)throw new Error('Invalid published exchange rate');return x}
function mid(a,b){return (asNumber(a)+asNumber(b))/2}
function formatNumber(n,key){
  if(n===null||!Number.isFinite(n)||n<0)return '—';
  const digits=key==='old'?2:key==='new'?4:6;
  return n.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:0});
}
function readableResult(n,key){
  if(n===null||!Number.isFinite(n)||n<0)return {main:'—',precise:''};
  const maxDecimals=n>0&&n<1?Math.min(12,Math.max(4,Math.ceil(-Math.log10(n))+2)):2;
  let main=n.toLocaleString('en-US',{maximumFractionDigits:maxDecimals,minimumFractionDigits:0});
  if(n>0&&Number(main.replace(/,/g,''))===0)main=n.toPrecision(3);
  let original=formatNumber(n,key);
  if(n>0&&Number(original.replace(/,/g,''))===0)
    original=n<1e-12?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:12});
  return {main,precise:original===main?'':original};
}
function timeLabel(date){
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',
    hour12:false,timeZone:'Asia/Damascus'
  }).format(date);
}
async function freshRates(){
  const r=await fetch(RATE_META,{headers:{'accept':'application/json','cache-control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(13000)});
  requireValid(r.ok,'Hasibat feed unavailable HTTP '+r.status);
  const j=await r.json();
  requireValid(j.ok===true&&Array.isArray(j.rows)&&j.rows.length>=3,'Hasibat feed has an unexpected schema');
  const age=Number(j.ageSeconds);
  requireValid(Number.isFinite(age)&&age>=0&&age<=900,'Exchange rates exceed 15 minutes; do not publish stale quotes');
  const index=new Map(j.rows.map(x=>[String(x.code).toUpperCase(),x]));
  for(const k of ['USD','EUR','TRY'])requireValid(index.has(k),'Rate not available: '+k);
  const usd=mid(index.get('USD').buyNew,index.get('USD').sellNew);
  const eur=mid(index.get('EUR').buyNew,index.get('EUR').sellNew);
  const trY=mid(index.get('TRY').buyNew,index.get('TRY').sellNew);
  requireValid(usd>0&&eur>0&&trY>0,'Nonpositive exchange rate');
  return {usd,eur,trY,ageSeconds:age,checkedAt:new Date(Date.now()-age*1000)};
}
function makeSnapshot(rates,awarenessText,when=new Date()){
  requireValid(messages.includes(awarenessText),'Awareness text must belong to the exact 53 supplied messages');
  const amount=1,sypNew=rates.usd;
  const numbers={new:sypNew,old:sypNew*100,usd:amount,try:sypNew/rates.trY,eur:sypNew/rates.eur};
  const code={new:'SYP NEW',old:'SYP OLD',try:'TRY',usd:'USD',eur:'EUR'};
  const labels={new:'الليرة السورية الجديدة',old:'الليرة السورية القديمة',try:'الليرة التركية',usd:'الدولار الأمريكي',eur:'اليورو الأوروبي'};
  return {amount,selected:'usd',inputCode:'USD',inputLabel:labels.usd,
    createdAt:timeLabel(when),checkedAt:timeLabel(rates.checkedAt),stale:rates.ageSeconds>1800,
    awareness:{text:awarenessText},
    results:['new','old','usd','try','eur'].map(key=>{
      const {main,precise}=readableResult(numbers[key],key);
      return {key,code:code[key],title:labels[key],value:main,exact:precise||main}
    })};
}
async function prepareAssets(){
  if(!initialized) initialized=(async()=>{
    try{
      const r=await fetch(AR_FONT,{signal:AbortSignal.timeout(9000)});
      if(r.ok){const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>10000&&bytes.length<2_000_000)GlobalFonts.register(bytes,'HasibatArabic')}
    }catch(e){console.warn('HasibatArabic font fallback:',e.message)}
  })();
  return initialized;
}
async function appLogo(){
  if(!logoPromise)logoPromise=(async()=>{
    const response=await fetch(LOGO,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Logo HTTP '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    requireValid(bytes.length>2000&&bytes.length<800000,'Logo is not a valid icon asset');
    return loadImage(bytes);
  })().catch(e=>{logoPromise=null;console.warn('Hasibat logo fallback:',e.message);return null});
  return logoPromise;
}
function wrapAwareness(ctx,text,maxWidth,fontSize){
  ctx.save();ctx.font='700 '+fontSize+'px HasibatArabic, Tahoma, Arial, sans-serif';
  const lines=[];
  for(const paragraph of String(text).split(/\r?\n/)){
    const words=paragraph.trim().split(/\s+/).filter(Boolean);
    if(!words.length){lines.push('');continue;}
    let line='';
    for(const word of words){
      const attempt=line?line+' '+word:word;
      if(line&&ctx.measureText(attempt).width>maxWidth){lines.push(line);line=word}
      else line=attempt;
    }
    if(line)lines.push(line);
  }
  ctx.restore();return lines;
}
function contextText(ctx,text,x,y,size,color,weight,align,maxWidth){
  ctx.save();ctx.direction=align==='left'?'ltr':'rtl';
  ctx.textAlign=align||'right';ctx.textBaseline='middle';
  ctx.fillStyle=color;
  ctx.font=(weight||700)+' '+size+'px HasibatArabic, Tahoma, Arial, sans-serif';
  if(maxWidth)ctx.fillText(String(text),x,y,maxWidth);else ctx.fillText(String(text),x,y);
  ctx.restore();
}
function rounded(ctx,x,y,w,h,r){
  ctx.beginPath();
  if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r);
  else{
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+r);ctx.closePath();
  }
}
async function generatePng(snapshot,omitLogo=false){
  await prepareAssets();
  const W=1080,canvas=createCanvas(W,1);
  const measure=canvas.getContext('2d');
  requireValid(measure,'Canvas 2D unavailable');
  requireValid(snapshot.awareness&&messages.includes(snapshot.awareness.text),'Invalid awareness message');
  const messageFontSize=24,messageLineHeight=34;
  const messageLines=wrapAwareness(measure,snapshot.awareness.text,794,messageFontSize);
  const messageBoxHeight=Math.max(90,57+messageLines.length*messageLineHeight);
  const H=1690+Math.max(0,snapshot.results.length-5)*156+Math.max(0,messageBoxHeight-90);
  canvas.height=H;
  const ctx=canvas.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#071b15');bg.addColorStop(.55,'#123d2b');bg.addColorStop(1,'#06150f');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(1080,0,140+i*82,0,Math.PI*2);ctx.strokeStyle='rgba(237,202,120,'+(0.13-i*.019)+')';ctx.lineWidth=2;ctx.stroke()}
  rounded(ctx,38,35,1004,H-70,34);ctx.strokeStyle='#a78c55';ctx.lineWidth=2;ctx.stroke();
  rounded(ctx,54,51,972,H-102,28);ctx.strokeStyle='rgba(255,227,154,0.24)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(540,136,44,0,Math.PI*2);ctx.fillStyle='#d9b86a';ctx.fill();
  contextText(ctx,'ل',540,138,48,'#0b2b1f',900,'center');
  const logo=omitLogo?null:await appLogo();
  if(logo){rounded(ctx,495,90,90,90,19);ctx.save();ctx.clip();ctx.drawImage(logo,495,90,90,90);ctx.restore()}
  contextText(ctx,'حاسبة الليرة السورية',540,218,49,'#fff8e6',900,'center');
  contextText(ctx,'نتائج تحويل العملات',540,273,26,'#e9d094',700,'center');
  ctx.fillStyle='#c8a65c';ctx.fillRect(120,311,840,2);
  rounded(ctx,100,345,880,159,20);
  const band=ctx.createLinearGradient(120,350,980,504);
  band.addColorStop(0,'#224a32');band.addColorStop(1,'#143527');
  ctx.fillStyle=band;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#bd9e61';ctx.stroke();
  contextText(ctx,'المبلغ المدخل',940,385,27,'#f7e0a4',750,'right');
  contextText(ctx,snapshot.inputLabel+'  ·  '+snapshot.inputCode,940,454,28,'#fff7e8',700,'right');
  contextText(ctx,formatNumber(snapshot.amount,snapshot.selected),135,443,56,'#ffffff',900,'left',455);
  contextText(ctx,'القيم المحوّلة',940,552,30,'#ffe2a0',850,'right');
  let y=584;
  for(const r of snapshot.results){
    const active=r.key===snapshot.selected;
    rounded(ctx,100,y,880,145,21);
    ctx.fillStyle=active?'#224d36':(y%2?'#123528':'#143c2c');ctx.fill();
    ctx.lineWidth=active?3:1.4;ctx.strokeStyle=active?'#efd38d':'#54755a';ctx.stroke();
    rounded(ctx,830,y+18,119,42,20);ctx.fillStyle='#463b22';ctx.fill();
    contextText(ctx,r.code,889,y+41,20,'#ffe4a1',800,'center');
    contextText(ctx,r.title,795,y+51,27,'#fffaf0',800,'right');
    contextText(ctx,r.value,135,y+101,42,'#ffffff',900,'left',575);
    if(r.exact!==r.value)contextText(ctx,'القيمة الدقيقة: '+r.exact,135,y+131,17,'#c9ddd2',600,'left',650);
    contextText(ctx,active?'العملة المختارة':'سعر التحويل الوسطي',942,y+108,19,'#e2eadd',650,'right');
    y+=156;
  }
  ctx.fillStyle='#bf9d55';ctx.fillRect(110,y+18,860,2);
  contextText(ctx,'وقت إنشاء الصورة: '+snapshot.createdAt,947,y+48,23,'#fff4d8',750,'right');
  contextText(ctx,'آخر تحديث ناجح للأسعار: '+snapshot.checkedAt,947,y+88,19,'#cbdccc',650,'right');
  contextText(ctx,snapshot.stale?'أسعار محفوظة — قد تكون غير محدثة':'أسعار متاحة وقت إنشاء الصورة',947,y+126,20,snapshot.stale?'#ffd08a':'#cde9d3',750,'right');
  rounded(ctx,101,y+153,879,messageBoxHeight,17);
  ctx.fillStyle='#15442e';ctx.fill();ctx.strokeStyle='#c7a662';ctx.lineWidth=1;ctx.stroke();
  contextText(ctx,'رسالة نافعة',941,y+179,19,'#e9c67c',800,'right');
  for(let i=0;i<messageLines.length;i++)
    contextText(ctx,messageLines[i],940,y+153+62+i*messageLineHeight,messageFontSize,'#ffffff',700,'right',799);
  // Paint small metadata after all cards: some font engines omit these labels
  // if previously drawn between translucent card layers.
  contextText(ctx,'المبلغ المدخل',938,383,27,'#ffe6a5',800,'right');
  contextText(ctx,'القيم المحوّلة',938,549,29,'#ffe6a5',800,'right');
  snapshot.results.forEach((r,i)=>contextText(ctx,r.key===snapshot.selected?'العملة المختارة':'سعر التحويل الوسطي',940,584+i*156+111,21,'#e8eedd',800,'right'));
  contextText(ctx,'وقت إنشاء الصورة: '+snapshot.createdAt,946,y+48,24,'#fff9e5',800,'right');
  contextText(ctx,'آخر تحديث ناجح للأسعار: '+snapshot.checkedAt,946,y+88,22,'#e4f2dc',800,'right');
  contextText(ctx,snapshot.stale?'أسعار محفوظة — قد تكون غير محدثة':'أسعار متاحة وقت إنشاء الصورة',946,y+125,20,'#cde9d3',800,'right');
  const output=canvas.toBuffer('image/png');
  requireValid(Buffer.isBuffer(output)&&output.length>20000&&output.subarray(0,8).toString('hex')==='89504e470d0a1a0a','PNG export invalid');
  requireValid(output.readUInt32BE(16)===W&&output.readUInt32BE(20)===H,'PNG dimensions invalid');
  return {buffer:output,width:W,height:H};
}
module.exports={messages,formatNumber,readableResult,timeLabel,freshRates,makeSnapshot,generatePng};
