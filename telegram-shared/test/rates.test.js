'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const pub=require('../rates-publisher'),renderer=require('../hasibat-image');
test('exactly four scheduled hours in Damascus',()=>{
  const slots=[['2026-11-11T04:00:00Z','07'],['2026-11-11T08:00:00Z','11'],
    ['2026-11-11T12:00:00Z','15'],['2026-11-11T16:00:00Z','19']];
  for(const [utc,slot] of slots)assert.equal(pub.allowedSlot(new Date(utc)).slot,slot);
  for(const h of [0,5,9,13,18,20,23])
    assert.equal(pub.allowedSlot(new Date(Date.UTC(2026,10,11,h))),null);
  assert.equal(pub.allowedSlot(new Date('2026-11-11T04:22:00Z')),null);
  assert.equal(pub.allowedSlot(new Date('2026-11-11T08:01:00Z'),'19'),null);
});
test('53 owner-supplied messages, permutation and nonrepeat across cycles',()=>{
  assert.equal(renderer.messages.length,53);
  assert.equal(new Set(renderer.messages).size,53);
  let prev=-1,cycle;
  for(let j=0;j<10;j++){
    cycle=pub.randomShuffle(prev);
    assert.equal(new Set(cycle).size,53);
    assert.notEqual(cycle[0],prev);
    assert.equal(pub.isGoodRotation({order:cycle,index:0,last:prev}),true);
    prev=cycle[52];
  }
});
test('exact mobile conversion formulas for 1 USD',()=>{
  const rates={usd:146.25,eur:162.4,trY:2.905,ageSeconds:2,checkedAt:new Date('2026-11-11T03:59:58Z')};
  const snap=renderer.makeSnapshot(rates,renderer.messages[0],new Date('2026-11-11T04:00:00Z'));
  assert.deepEqual(snap.results.map(x=>x.key),['new','old','usd','try','eur']);
  assert.equal(snap.results[0].value,'146.25');
  assert.equal(snap.results[1].value,'14,625');
  assert.equal(snap.results[2].value,'1');
  assert.equal(snap.results[3].value,'50.34');
  assert.equal(snap.results[4].value,'0.9006');
});
