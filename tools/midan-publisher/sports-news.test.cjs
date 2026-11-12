'use strict';
const assert=require('node:assert/strict');
const {isSports,selectSports}=require('./sports-news.cjs');
const data=[
 {id:'one',title:'منتخب سوريا للووشو كونغ فو يشارك في بطولة أوراسيا بتركيا',category:'local'},
 {id:'two',title:'شركة كهرباء دير الزور تواصل معالجة الأعطال',category:'local'},
 {id:'three',title:'اجتماع سياسي لمناقشة مستقبل منتخب المدينة',category:'politics'},
 {id:'four',title:'نتائج مباراة كرة القدم بين ناديين سوريين',category:'local'},
 {id:'five',title:'خبر مباشر',category:'sports'}
];
assert.equal(isSports(data[0]),true);
assert.equal(isSports(data[1]),false);
assert.equal(isSports(data[2]),false);
assert.equal(selectSports(data,'sports').length,3);
assert.equal(selectSports(data,'general').length,2);
assert.ok(selectSports(data,'sports').every(x=>x.category==='sports'));
assert.ok(selectSports(data).every(x=>!isSports(x)));
console.log('PASS: sports excluded from general feed and isolated in sports-only feed');
