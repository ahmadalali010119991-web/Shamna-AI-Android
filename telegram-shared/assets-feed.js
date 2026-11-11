'use strict';
/**
 * Inputs mirror the actual v1.8.23 Hasibat app:
 * - Gold: https://sp-today.com/gold, the same source read by CurrencyHost.
 * - Fuel: https://hasibat-fuel-feed.vercel.app/api/fuel, the exact feed
 *   consumed by fuel-widget.js (no invented/current-price substitutions).
 * - USD: the existing Telegram bridge's rates-preview metadata.
 *
 * Fail closed for unexpected schema; never fabricate quotes.
 */
const GOLD_URL='https://sp-today.com/gold';
const FUEL_URL='https://hasibat-fuel-feed.vercel.app/api/fuel';
const GOLD_KARATS=['24','22','21','18','14'];
const FUEL_IDS=['gasoline95','gasoline90','diesel','lpg10kg'];
const FUEL_LABELS={gasoline95:'بنزين 95',gasoline90:'بنزين 90',diesel:'مازوت',lpg10kg:'غاز منزلي'};
const FUEL_UNITS={gasoline95:'لتر',gasoline90:'لتر',diesel:'لتر',lpg10kg:'أسطوانة (10 كغ)'};
function must(condition,message){if(!condition)throw new Error(message)}
function safeNumber(s){
 const value=Number(String(s).replace(/,/g,''));
 must(Number.isFinite(value)&&value>0&&value<2e8,'Price must be a positive finite verified number');
 return value;
}
function textify(html){
 return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
 .replace(/<[^>]+>/g,' ')
 .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&')
 .replace(/&lrm;|&rlm;/gi,' ').replace(/[\u200e\u200f\u061c]/g,' ')
 .replace(/\s+/g,' ').trim();
}
function parseGold(html,checkedAt=new Date()){
 const t=textify(html);
 // The public prices page displays separate USD and Syrian pound panels.
 const first=t.indexOf('الأسعار العالمية');
 const second=t.indexOf('الأسعار المحلية');
 must(first>=0&&second>first,'Cannot locate both app gold price panels');
 const usd=t.slice(first,second);
 const local=t.slice(second);
 const result={checkedAt:checkedAt.getTime(),source:GOLD_URL};
 for(const k of GOLD_KARATS){
  // Read price pairs AFTER exact karat label and before the next karat;
  // reject changes in layout rather than silently mixing buy and sell.
  const usdMatch=usd.match(new RegExp('(?:^|\\s)'+k+'K\\s+[\\S\\s]{0,85}?مبيع\\s*\\$\\s*([\\d,.]+)\\s*شراء\\s*\\$\\s*([\\d,.]+)','u'));
  const sypMatch=local.match(new RegExp('(?:^|\\s)'+k+'K\\s+[\\S\\s]{0,80}?شراء\\s*([\\d,.]+)\\s*ل\\.س\\s*جديدة\\s*مبيع\\s*([\\d,.]+)\\s*ل\\.س\\s*جديدة','u'));
  must(usdMatch&&sypMatch,'Missing trusted gold quote for '+k+'K');
  const usdSell=safeNumber(usdMatch[1]),usdBuy=safeNumber(usdMatch[2]);
  const sypBuy=safeNumber(sypMatch[1]),sypSell=safeNumber(sypMatch[2]);
  must(usdSell>=usdBuy&&sypSell>=sypBuy,'Reversed gold buy/sell quote for '+k+'K');
  must(sypBuy>=500&&sypBuy<=1e7&&usdBuy>=1&&usdBuy<20000,'Unexpected gold price range');
  result['g'+k]={usdBuy,usdSell,sypBuy,sypSell};
 }
 return result;
}
function parseFuel(js,checkedAt=new Date()){
 const pattern=/^\s*window\.HasibatFuelReceive\s*&&\s*window\.HasibatFuelReceive\((\{[\s\S]*\})\);?\s*$/u;
 const m=String(js).match(pattern);
 must(m,'Fuel feed does not use the expected JSONP payload');
 const raw=JSON.parse(m[1]);
 must(['https://sp-today.com/energy','https://sypnow.com/ar/fuel'].includes(raw.source),
   'Fuel feed contains an untrusted source');
 must(Array.isArray(raw.rows)&&raw.rows.length===4,'Fuel feed must contain four products');
 must(typeof raw.sourceUpdatedAt==='string'&&/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(raw.sourceUpdatedAt),
   'Fuel price publication date not available');
 const dateMatch=raw.sourceUpdatedAt.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
 const published=new Date(Date.UTC(Number(dateMatch[3]),Number(dateMatch[2])-1,Number(dateMatch[1])));
 must(published.getUTCDate()===Number(dateMatch[1])&&published.getUTCMonth()+1===Number(dateMatch[2]),
   'Fuel price publication date invalid');
 const ageDays=Math.floor((checkedAt.getTime()-published.getTime())/86400000);
 must(ageDays>=0,'Fuel publication date lies in the future');
 const values=new Map();
 for(const row of raw.rows){
  must(FUEL_IDS.includes(row.id)&&!values.has(row.id),'Unexpected duplicate fuel product');
  const newSyp=safeNumber(row.newSyp);
  must(newSyp>=10&&newSyp<=20000,'Fuel quote is outside safe range');
  values.set(row.id,newSyp);
 }
 must(values.size===4,'Fuel list is incomplete');
 return {checkedAt:checkedAt.getTime(),source:raw.source,sourceUpdatedAt:raw.sourceUpdatedAt,
   ageDays,stale:ageDays>7,rows:FUEL_IDS.map(id=>({id,label:FUEL_LABELS[id],
    unit:FUEL_UNITS[id],newSyp:values.get(id)}))};
}
async function fetchText(url){
 const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Hasibat-AlLira/1.8.23; +https://dallalna.com)',
   'accept':'text/html,application/javascript,*/*','cache-control':'no-cache'},
   signal:AbortSignal.timeout(18000),cache:'no-store'});
 must(r.ok,'Source fetch failed ('+r.status+') '+new URL(url).hostname);
 const content=await r.text();
 must(content.length>300&&content.length<3_000_000,'Source response size invalid');
 return content;
}
async function gold(){const now=new Date();return parseGold(await fetchText(GOLD_URL),now)}
async function fuel(){const now=new Date();return parseFuel(await fetchText(FUEL_URL),now)}
module.exports={GOLD_URL,FUEL_URL,GOLD_KARATS,FUEL_IDS,FUEL_LABELS,FUEL_UNITS,
 textify,safeNumber,parseGold,parseFuel,gold,fuel};
