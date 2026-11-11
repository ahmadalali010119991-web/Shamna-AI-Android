'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../midan-awareness-daily');
test('53 original awareness assets in a full no-repeat cycle',()=>{
 const seen=new Set(),first=m.shuffle(-1);
 assert.equal(first.length,53);assert.equal(new Set(first).size,53);
 for(let i=0;i<53;i++){
   assert.match(m.filename(i),/^Midan_AlKhabar_Message_\d{2}\.png$/);
   assert.equal(m.filename(i).endsWith(String(i+1).padStart(2,'0')+'.png'),true);
   const caption=m.caption(i);
   assert.ok(caption.length>50&&caption.length<=1024);
   assert.ok(caption.includes('مقتطف من مشروع الإسلام المتعب'));
 }
 const second=m.shuffle(first[52]);
 assert.equal(new Set(second).size,53);
 assert.notEqual(second[0],first[52]);
});
test('20:30 Damascus only (no interference with rates/news)',()=>{
 for(const minute of [30,31,40,45]){
   const t=new Date('2026-11-11T17:'+String(minute).padStart(2,'0')+':00Z');
   assert.equal(m.windowFor(t)?.slot,'20:30');
 }
 for(const when of ['2026-11-11T17:29:59Z','2026-11-11T17:46:00Z','2026-11-11T16:30:00Z','2026-11-11T04:00:00Z']){
   assert.equal(m.windowFor(new Date(when)),null);
 }
});
