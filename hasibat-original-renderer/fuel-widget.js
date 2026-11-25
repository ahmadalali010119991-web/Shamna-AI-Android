/* Hasibat fuel module — additive, independent of CurrencyHost and existing updater. */
(function(){
'use strict';
const PRIMARY='https://sp-today.com/energy';
const BACKUP='https://sypnow.com/ar/fuel';
const ENDPOINT='https://hasibat-fuel-feed.vercel.app/api/fuel';
const ids=['gasoline95','gasoline90','diesel','lpg10kg'];
const labels={gasoline95:'بنزين 95',gasoline90:'بنزين 90',diesel:'مازوت',lpg10kg:'غاز منزلي'};
const units={gasoline95:'لتر',gasoline90:'لتر',diesel:'لتر',lpg10kg:'أسطوانة (10 كغ)'};
const grid=document.getElementById('fuelGrid'),status=document.getElementById('fuelStatus');
const refresh=document.getElementById('fuelRefresh'),sourceLink=document.getElementById('fuelSource');
if(!grid||!status||!refresh)return;
let data=null,connection='offline',lastRequest=0,deadline=null;
const fmt=(n,p=2)=>Number(n).toLocaleString('en-US',{maximumFractionDigits:p});
function rate(){try{if(typeof model!=='undefined'&&model.rates){const x=Number(model.rates.usdSell);return Number.isFinite(x)&&x>0?x:null;}}catch(e){}return null;}
function parseDate(x){let t=String(x||'').replace(/[\u200e\u200f\u061c]/g,'').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));const m=t.match(/(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(20\d{2})/);if(!m)return null;const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));return d.getDate()===Number(m[1])&&d.getMonth()+1===Number(m[2])?d:null;}
function verified(v){if(!v||![PRIMARY,BACKUP].includes(v.source)||!Array.isArray(v.rows)||v.rows.length!==4)return null;const map=new Map();for(const row of v.rows){if(!row||!ids.includes(row.id)||map.has(row.id))return null;const n=Number(row.newSyp);if(!Number.isFinite(n)||n<=0||n>20000)return null;map.set(row.id,n);}if(map.size!==4||!parseDate(v.sourceUpdatedAt))return null;const checked=Number(v.checkedAt);if(!Number.isFinite(checked)||checked<1577836800000||checked>Date.now()+86400000)return null;return {values:map,source:v.source,sourceUpdatedAt:String(v.sourceUpdatedAt),checkedAt:checked};}
function save(d){try{localStorage.setItem('hasibat_fuel_last_valid',JSON.stringify({source:d.source,sourceUpdatedAt:d.sourceUpdatedAt,checkedAt:d.checkedAt,rows:ids.map(id=>({id,newSyp:d.values.get(id)}))}));}catch(e){}}
function render(){grid.replaceChildren();if(!data){status.textContent='تعذر جلب أسعار موثوقة؛ اضغط «تحديث» عند توفر الإنترنت.';return;}
const dt=parseDate(data.sourceUpdatedAt),age=dt?Math.floor((Date.now()-dt.getTime())/86400000):null;
const original=data.source===PRIMARY;
status.textContent=(connection==='online'?'تم التحقق من أسعار الوقود':'آخر أسعار محفوظة — لم ينجح التحديث')+' · تاريخ الأسعار: '+data.sourceUpdatedAt+' · المصدر: '+(original?'SP Today':'SYPNow (احتياطي)')+(age!==null&&age>7?' · تنبيه: آخر تعديل للسعر قديم ('+age+' يومًا)، وليس سعرًا لحظيًا':'');
if(sourceLink){sourceLink.href=data.source;sourceLink.textContent=original?'عرض المصدر الأساسي':'عرض المصدر الاحتياطي';}
const usd=rate();for(const id of ids){const n=data.values.get(id);const card=document.createElement('article');card.className='fuel-card';const head=document.createElement('div');head.className='fuel-card-title';const name=document.createElement('span');name.textContent=labels[id];const unit=document.createElement('span');unit.className='fuel-unit';unit.textContent='لكل '+units[id];head.append(name,unit);card.appendChild(head);
const row=document.createElement('div');row.className='fuel-quote-row';const syBox=document.createElement('div');syBox.className='fuel-syp-box';const syTitle=document.createElement('span');syTitle.className='fuel-label';syTitle.textContent='بالليرة السورية الجديدة';const syValue=document.createElement('strong');syValue.className='fuel-main-price';syValue.textContent=fmt(n)+' ل.س';const old=document.createElement('div');old.className='fuel-previous-price';old.textContent='بالقديمة: '+fmt(n*100)+' ل.س';syBox.append(syTitle,syValue,old);
const usBox=document.createElement('div');usBox.className='fuel-usd-box';const usTitle=document.createElement('span');usTitle.className='fuel-label';usTitle.textContent='بالدولار الأمريكي (تقديري)';const usValue=document.createElement('strong');usValue.className='fuel-main-price';usValue.textContent=usd?'$'+Number(n/usd).toFixed(2):'—';usBox.append(usTitle,usValue);row.append(syBox,usBox);card.appendChild(row);grid.appendChild(card);}}
window.HasibatFuelSnapshot=function(){return data?{source:data.source,sourceUpdatedAt:data.sourceUpdatedAt,checkedAt:data.checkedAt,connection,usdSell:rate(),rows:ids.map(id=>({id,label:labels[id],unit:units[id],newSyp:data.values.get(id)}))}:null;};
window.HasibatFuelReceive=function(payload){if(deadline){clearTimeout(deadline);deadline=null;}const d=verified(payload);if(d){data=d;connection='online';save(d);}else{connection='offline';}render();};
try{const v=localStorage.getItem('hasibat_fuel_last_valid');if(v)data=verified(JSON.parse(v));}catch(e){}
function load(){if(Date.now()-lastRequest<30000)return;lastRequest=Date.now();if(data)status.textContent='جارِ التحقق من الأسعار…';else status.textContent='جارِ تحميل أسعار المحروقات…';const script=document.createElement('script');script.async=true;script.src=ENDPOINT+'?t='+Math.floor(Date.now()/600000);script.referrerPolicy='no-referrer';script.onerror=()=>{connection='offline';render();};script.onload=()=>{script.remove();};document.head.appendChild(script);deadline=setTimeout(()=>{connection='offline';render();},17000);}
refresh.addEventListener('click',()=>{lastRequest=0;load();});
sourceLink?.addEventListener('click',function(e){try{if(window.CurrencyHost&&CurrencyHost.openExternal){e.preventDefault();CurrencyHost.openExternal(this.href);}}catch(_){}});
const original=window.onAppRates;if(typeof original==='function')window.onAppRates=function(){const r=original.apply(this,arguments);render();return r;};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastRequest>900000)load();});
window.addEventListener('online',()=>{if(Date.now()-lastRequest>600000)load();});
setInterval(()=>{if(!document.hidden&&Date.now()-lastRequest>900000)load();},900000);
render();load();
})();
