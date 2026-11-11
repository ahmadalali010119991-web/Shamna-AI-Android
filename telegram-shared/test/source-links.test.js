'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const f=require('../source-links');
const long='https://www.aa.com.tr/ar/'+('%D8%A7%D9%84').repeat(80);
test('HTML source URL collapsed to clickable original source',()=>{
 const text='📰 <b>خبر مهم</b>\nمعلومات الخبر\n🔗 '+long+'\n#ميدان_الخبر';
 const out=f.rewritePayload({text,parse_mode:'HTML'});
 assert.notEqual(out.text,text);assert.equal(out.text.includes(long),true);
 assert.equal(out.text.includes('🔗 <a href="'+long+'">المصدر</a>'),true);
 assert.equal(out.text.includes('معلومات الخبر'),true);assert.equal(out.parse_mode,'HTML');
});
test('plain message gets entity with correct UTF-16 index (emoji)',()=>{
 const text='📰 الخبر\n🔗 '+long;
 const o=f.rewritePayload({text});
 assert.equal(o.text.includes(long),false);
 assert.equal(o.text.slice(o.entities[0].offset,o.entities[0].offset+o.entities[0].length),'المصدر');
 assert.equal(o.entities[0].url,long);
});
test('untouched already linked message and unrelated URLs',()=>{
 const txt='<a href="'+long+'">المصدر</a>';
 assert.strictEqual(f.rewritePayload({text:txt,parse_mode:'HTML'}).text,txt);
 const other='رابط منصة https://example.org/link\n#ميدان_الخبر';
 assert.strictEqual(f.rewritePayload({text:other}).text,other);
});
test('markdown existing formatting stays unmodified rather than broken',()=>{
 const txt='*خبر*\n🔗 '+long;
 assert.strictEqual(f.rewritePayload({text:txt,parse_mode:'MarkdownV2'}).text,txt);
});
