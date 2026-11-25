/* Hasibat v1.8.22: gold and fuel PNGs from the application's verified price state.
   Uses the very same native save/share preview and 53-message awareness rotation as currency PNGs. */
(function(){
 'use strict';
 const tools=window.HasibatShareTools;
 if(!tools)return;
 const buyGold=document.getElementById('shareGoldResults');
 const buyFuel=document.getElementById('shareFuelResults');
 if(!buyGold||!buyFuel)return;
 const GOLD_KARATS=['24','22','21','18','14'];
 const format=(x,digits=2)=>Number(x).toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:0});
 const valid=(x)=>Number.isFinite(x)&&x>0;
 function notify(kind,msg,error){
  const p=document.getElementById(kind==='gold'?'shareGoldStatus':'shareFuelStatus');
  if(!p)return;p.hidden=false;p.textContent=msg;p.dataset.error=error?'true':'false';
 }
 function ensureGold(){
  const g=typeof model!=='undefined'?model.gold:null;
  if(!g||typeof validGold!=='function'||!validGold(g))throw Error('لا توجد أسعار ذهب موثّقة محفوظة. حدّث الأسعار ثم أعد المحاولة.');
  const at=new Date(g.checkedAt);if(Number.isNaN(at.getTime()))throw Error('تاريخ أسعار الذهب غير متاح.');
  return {kind:'gold',title:'أسعار الذهب في سوريا',subtitle:'سعر الغرام الواحد · شراء ومبيع دون مصنعية',
   created:tools.timeLabel(new Date()),updated:tools.timeLabel(at),source:'أسعار الذهب المعتمدة في حاسبة الليرة',stale:model.goldConnection!=='online',
   rows:GOLD_KARATS.map(k=>({key:k,title:'عيار '+k,tag:k+'K',buy:g['g'+k].sypBuy,sell:g['g'+k].sypSell,usdBuy:g['g'+k].usdBuy,usdSell:g['g'+k].usdSell})),
   footnote:'الأسعار استرشادية للغرام وقد تختلف حسب المدينة والمصنعية.'};
 }
 function ensureFuel(){
  const data=window.HasibatFuelSnapshot?.();
  if(!data||!Array.isArray(data.rows)||data.rows.length!==4||data.rows.some(r=>!valid(r.newSyp)))
    throw Error('لا توجد أسعار محروقات موثوقة محفوظة. حدّثها ثم أعد المحاولة.');
  const updated=new Date(data.checkedAt);
  if(Number.isNaN(updated.getTime()))throw Error('وقت التحقق من أسعار المحروقات غير معروف.');
  const text=String(data.sourceUpdatedAt||'').trim();
  const nums=text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);
  let daysOld=null;
  if(nums){const date=new Date(Number(nums[3]),Number(nums[2])-1,Number(nums[1]));
   if(date.getDate()===Number(nums[1])&&date.getMonth()+1===Number(nums[2]))daysOld=Math.floor((Date.now()-date.getTime())/86400000);}
  const stale=data.connection!=='online'||daysOld===null||daysOld>7;
  const source=data.source.includes('sp-today.com')?'SP Today':'SYPNow (احتياطي)';
  return {kind:'fuel',title:'أسعار المحروقات في سوريا',subtitle:'بنزين 95 و90 · مازوت · الغاز المنزلي',
   created:tools.timeLabel(new Date()),updated:tools.timeLabel(updated),source,sourceUpdated:text,stale,
   rows:data.rows.map(r=>({title:r.label,tag:r.id==='lpg10kg'?'10 KG':r.id==='diesel'?'DIESEL':r.id==='gasoline95'?'95':'90',
      unit:r.unit,syp:r.newSyp,old:r.newSyp*100,usd:valid(data.usdSell)?r.newSyp/data.usdSell:null})),
   footnote:stale?'تنبيه: تاريخ السعر قديم أو غير مؤكّد؛ ليست أسعارًا لحظية.':'تاريخ المصدر يحدد سريان الأسعار؛ الدولار قيمة تقريبية.'};
 }
 function wrap(ctx,value,maxW,fontSize){
  const lines=[];ctx.save();ctx.font='700 '+fontSize+'px Tahoma,Arial,sans-serif';
  for(const paragraph of String(value).split(/\r?\n/)){
   const words=paragraph.trim().split(/\s+/).filter(Boolean);if(!words.length){lines.push('');continue;}
   let current='';for(const w of words){const next=current?current+' '+w:w;
    if(current&&ctx.measureText(next).width>maxW){lines.push(current);current=w;}else current=next;}
   if(current)lines.push(current);
  }
  ctx.restore();return lines;
 }
 async function makeImage(snapshot,omitLogo=false){
  const c=document.createElement('canvas');c.width=1080;
  const temp=c.getContext('2d');if(!temp)throw Error('تعذر تشغيل مولّد صور النتائج.');
  const lines=wrap(temp,snapshot.awareness.text,792,23),lineHeight=34;
  const boxH=Math.max(90,57+lines.length*lineHeight);
  const rowH=snapshot.kind==='gold'?212:199;
  const begin=401;
  const end=begin+snapshot.rows.length*rowH;
  const H=end+346+boxH;
  c.height=H;
  const ctx=c.getContext('2d');const text=tools.contextText,rounded=tools.rounded;
  const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#081f17');bg.addColorStop(.56,'#143e2c');bg.addColorStop(1,'#061b12');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,H);
  for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(1080,0,140+i*80,0,Math.PI*2);ctx.strokeStyle='rgba(237,205,123,'+(0.12-i*.017)+')';ctx.lineWidth=2;ctx.stroke();}
  rounded(ctx,37,31,1006,H-62,33);ctx.strokeStyle='#a58b51';ctx.lineWidth=2;ctx.stroke();
  rounded(ctx,55,49,970,H-99,27);ctx.strokeStyle='rgba(255,228,151,.27)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(540,125,43,0,Math.PI*2);ctx.fillStyle='#d6b567';ctx.fill();text(ctx,'ل',540,127,47,'#0c3022',900,'center');
  const icon=omitLogo?null:await tools.appLogo();
  if(icon){rounded(ctx,495,80,90,90,19);ctx.save();ctx.clip();ctx.drawImage(icon,495,80,90,90);ctx.restore();}
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
  const base=end+21;
  ctx.fillStyle='#c9a45e';ctx.fillRect(105,base,869,2);
  const dateLines=[
   'وقت إنشاء الصورة: '+snapshot.created,
   'آخر تحديث ناجح للبيانات: '+snapshot.updated,
   ...(snapshot.kind==='fuel'?['تاريخ أسعار المحروقات المنشورة: '+snapshot.sourceUpdated]:[]),
   'مصدر الأسعار: '+snapshot.source,
   snapshot.stale?'تنبيه: بيانات محفوظة أو غير حديثة، وليست سعرًا لحظيًا.':'الأسعار المتاحة وقت إنشاء الصورة'
  ];
  dateLines.forEach((line,i)=>text(ctx,line,947,base+33+i*34,i===0?21:19,i===0?'#fff5d7':'#d6ead8',750,'right',820));
  const messageTop=base+195;
  rounded(ctx,97,messageTop,887,boxH,17);ctx.fillStyle='#16462f';ctx.fill();ctx.strokeStyle='#c5a666';ctx.lineWidth=1.4;ctx.stroke();
  text(ctx,'رسالة نافعة',944,messageTop+27,19,'#ead08f',850,'right');
  lines.forEach((line,i)=>text(ctx,line,938,messageTop+61+i*lineHeight,23,'#ffffff',700,'right',800));
  const noteY=messageTop+boxH+30;
  text(ctx,snapshot.footnote,943,noteY,17,'#dfebd9',650,'right',817);
  try{return c.toDataURL('image/png');}
  catch(error){if(!omitLogo&&error?.name==='SecurityError')return makeImage(snapshot,true);throw error;}
 }
 async function doShare(kind,button){
  button.disabled=true;
  try{
   const snap=kind==='gold'?ensureGold():ensureFuel();
   const tip=tools.reserveImageAwareness();snap.awareness={text:tip.text};
   const png=await makeImage(snap);
   const name='Hasibat-AlLira-'+(kind==='gold'?'Gold':'Fuel')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
   tip.commit();tools.showPreview(png,name);
   notify(kind,'الصورة جاهزة؛ اختر حفظ PNG أو مشاركة.',false);
  }catch(e){notify(kind,e?.message||'تعذر إنشاء صورة الأسعار.',true);}
  finally{button.disabled=false;}
 }
 buyGold.addEventListener('click',()=>doShare('gold',buyGold));
 buyFuel.addEventListener('click',()=>doShare('fuel',buyFuel));
 // New opt-in; never change midpoint calculations or quoted rates.
 const KEY='hasibat:show-bid-ask:v1';let enabled=false;
 try{enabled=localStorage.getItem(KEY)==='true';}catch(e){}
 const board=document.getElementById('hasibatQuotes'),box=document.getElementById('hasibatQuotesCards');
 function renderQuotes(){
  board.classList.toggle('show',enabled);
  if(!enabled)return;
  box.replaceChildren();
  const data=typeof model!=='undefined'?model.rates:null;
  for(const [code,label,unit] of [['usd','الدولار الأمريكي','USD'],['eur','اليورو الأوروبي','EUR'],['try','الليرة التركية','TRY']]){
   const card=document.createElement('div');card.className='quote-card';
   const t=document.createElement('div');t.className='quote-code';t.textContent=label+' · '+unit;card.appendChild(t);
   const table=document.createElement('div');table.className='quote-amounts';
   for(const [s,k] of [['شراء',code+'Buy'],['بيع',code+'Sell']]){
    const v=document.createElement('div');const small=document.createElement('small');small.textContent=s;
    const strong=document.createElement('strong');strong.textContent=data&&valid(data[k])?format(data[k],4):'—';
    v.append(small,strong);table.appendChild(v);
   }
   card.appendChild(table);box.appendChild(card);
  }
 }
 window.HasibatQuotes=Object.freeze({isEnabled:()=>enabled,setEnabled:v=>{enabled=!!v;try{localStorage.setItem(KEY,String(enabled))}catch(e){}renderQuotes();}});
 const onRates=window.onAppRates;
 if(typeof onRates==='function')window.onAppRates=function(){const result=onRates.apply(this,arguments);renderQuotes();return result;};
 renderQuotes();
})();
