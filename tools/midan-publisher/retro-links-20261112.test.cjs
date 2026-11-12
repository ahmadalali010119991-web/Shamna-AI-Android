'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const mod=require('./retro-links-20261112.cjs');
const src='https://t.me/suhebb0/47977';
const title='بكل صراحة وعلى بساط أحمدي لم يعد هناك مجال لتجميل الواقع فالقامشلي اليوم تبدو وكأنها خارج خارطة الوطن';
const list=[{title:title.normalize('NFKC').replace(/[^\\p{L}\\p{N}]+/gu,' ').toLowerCase().trim(),url:src}];
const original='<i class="emoji"><b>🎙️</b></i> '+title+'<br/><br/>✍️ المصدر: صهيب اليعربي<br/><i class="emoji"><b>🔗</b></i> المنشور الأصلي<br/><br/>🔗 المصدر<br/><br/>تابعنا: <a href="https://www.instagram.com/alislam_almutab_book/">إنستغرام</a> | <a href="https://www.tiktok.com/@alislam_almutab_book">تيك توك</a>';
function page(html=original){return '<div data-post="maydan_alkhabar/526" class="tgme_widget_message"><div class="tgme_widget_message_photo_wrap"></div><div class="tgme_widget_message_text js-message_text" dir="auto">'+html+'</div></div>'}
test('Both original and source become links with exact canonical URL',()=>{const res=mod.prepare(526,page(),list);assert.equal(res.status,'ready');assert.equal(res.added,2);assert.equal(res.media,true);const labels=res.entities.filter(x=>x.type==='text_link').map(x=>({label:res.text.slice(x.offset,x.offset+x.length),url:x.url}));assert.ok(labels.some(x=>x.label==='المصدر'&&x.url===src));assert.ok(labels.some(x=>x.label==='المنشور الأصلي'&&x.url===src));assert.ok(labels.some(x=>x.label==='إنستغرام'));assert.ok(labels.some(x=>x.label==='تيك توك'));assert.equal(res.text.includes('بكل صراحة'),true)});
test('No verified canonical title means no edit',()=>assert.equal(mod.prepare(526,page(),[],).status,'unmatched'));
test('Already linked original source labels are not rewritten',()=>{const html=original.replace('🔗 المصدر','🔗 <a href="'+src+'">المصدر</a>').replace(' المنشور الأصلي',' <a href="'+src+'">المنشور الأصلي</a>');assert.equal(mod.prepare(526,page(html),list).status,'already_linked')});
test('Pinned message ids and canonical URLs preserve identity',()=>{assert.equal(mod.IDS.length,47);assert.ok(mod.IDS.includes(526));assert.ok(mod.IDS.includes(528));assert.equal(mod.exactSource(title,list),src)});
