'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const prices=require('../assets-feed');
const job=require('../assets-publisher');
const image=require('../hasibat-assets-image');
const app=require('../hasibat-image');
test('09:00 only for gold and fuel, and currency task remains independent',()=>{
 for(const m of [0,1,10,20]){
  const d=new Date('2026-11-11T06:'+String(m).padStart(2,'0')+':00Z');
  assert.equal(job.permitted(d)?.slot,'09');
 }
 for(const m of [21,30,45])assert.equal(job.permitted(new Date('2026-11-11T06:'+m+':00Z')),null);
 for(const h of [4,5,7,8,9,12,16,23])assert.equal(job.permitted(new Date(Date.UTC(2026,10,11,h))),null);
});
test('5 gold karats verified, bid/ask not interchanged',()=>{
 const list=['24','22','21','18','14'];
 const usd=list.map((k,i)=>k+'K ▲ 0.24 % مبيع $ '+(130-i*8)+'.00 شراء $ '+(128-i*8)+'.00').join(' ');
 const syp=list.map((k,i)=>k+'K ▲ 0.24 % شراء '+(18000-i*1000)+'.00 ل.س جديدة مبيع '+(18300-i*1000)+'.00 ل.س جديدة').join(' ');
 const g=prices.parseGold('<h2>الأسعار العالمية (دولار)</h2>'+usd+'<h2>الأسعار المحلية (ل.س)</h2>'+syp);
 for(const k of list)assert.ok(g['g'+k].sypSell>=g['g'+k].sypBuy);
 assert.equal(g.g24.usdBuy,128);
});
test('fuel payload is original JSONP, old published date is warned',()=>{
 const payload={source:'https://sp-today.com/energy',sourceUpdatedAt:'13/09/2026',checkedAt:Date.now(),
 rows:[{id:'gasoline95',newSyp:195},{id:'gasoline90',newSyp:185},{id:'diesel',newSyp:175},{id:'lpg10kg',newSyp:1600}]};
 const fuel=prices.parseFuel('window.HasibatFuelReceive&&window.HasibatFuelReceive('+JSON.stringify(payload)+');');
 assert.equal(fuel.stale,true);assert.equal(fuel.rows.length,4);
 assert.equal(fuel.rows[3].newSyp,1600);
 const photo=image.snapshotFuel(fuel,146.5,app.messages[2]);
 assert.ok(photo.footnote.includes('قديم'));
});
