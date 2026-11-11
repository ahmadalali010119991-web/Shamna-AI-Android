'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const m=require('../midan-awareness-daily');
test('53 exact original posters, tailored captions and random nonrepeat cycles',()=>{
 assert.equal(m.manifest.length,53);
 const distinct=new Set();
 for(let i=0;i<53;i++){
  const item=m.manifest[i];
  assert.equal(item.id,i+1);
  assert.match(item.file,/^Midan_AlKhabar_Message_\d{2}\.png$/);
  assert.equal(item.file.endsWith(String(i+1).padStart(2,'0')+'.png'),true);
  assert.ok(item.caption.length>50&&item.caption.length<=1024);
  assert.ok(item.caption.includes('مقتطف من مشروع'));
  assert.ok(item.caption.includes('الإسلام المتعب'));
  assert.match(item.sha256,/^[0-9a-f]{64}$/);
  distinct.add(item.sha256);
 }
 assert.equal(distinct.size,53);
 let last=-1;
 for(let iteration=0;iteration<40;iteration++){
  const order=m.shuffle(last);
  assert.equal(order.length,53);
  assert.equal(new Set(order).size,53);
  if(last>=0)assert.notEqual(order[0],last);
  assert.equal(m.validRotation({order,index:1,last:order[0]}),true);
  last=order[52];
 }
});
test('20:30 Damascus dispatch window only; unaffected four rates and 09:00',()=>{
 for(const minute of [30,31,40,45,49]){
  const t=new Date('2026-11-11T17:'+String(minute).padStart(2,'0')+':00Z');
  assert.equal(m.windowFor(t)?.slot,'20:30');
 }
 for(const when of ['2026-11-11T17:29:59Z','2026-11-11T17:50:00Z','2026-11-11T16:30:00Z','2026-11-11T04:00:00Z']){
  assert.equal(m.windowFor(new Date(when)),null);
 }
});
