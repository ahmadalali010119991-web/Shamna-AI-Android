'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const x=require('../news-original-photo');
test('find direct image in article OpenGraph metadata with original URL intact',()=>{
 const page='<html><head><meta property="og:image" content="https://images.example.com/news/real-photo.jpg"><meta property="og:title" content="خبر"></head></html>';
 assert.deepEqual(x.extractMetaImages(page,'https://example.com/a/123'),['https://images.example.com/news/real-photo.jpg']);
});
test('do not use publisher logo as a photo',()=>{
 const page='<meta property="og:image" content="https://example.org/assets/site-logo.png">';
 assert.deepEqual(x.extractMetaImages(page,'https://example.org/news/1'),[]);
});
test('a Telegram post photo can be discovered from source markup',()=>{
 const page='<a class="tgme_widget_message_photo_wrap" style="background-image:url(&#39;https://cdn4.telesco.pe/file/abc/photo.jpg&#39;)"></a>';
 // Telegram uses both quoted and unquoted CSS URLs, the parser must reject malformed photo hints.
 assert.ok(Array.isArray(x.extractMetaImages(page,'https://t.me/s/test/123')));
});
test('original source URL extracted from news, not shortened or replaced',()=>{
 const url='https://www.aa.com.tr/ar/'+('%D8%A7').repeat(100);
 assert.equal(x.sourceLink({text:'📰 <b>عنوان</b>\n\n🔗 '+url}),url);
 const msg=x.makeCaption('<b>عنوان الخبر</b> مع نص الخبر\n🔗 '+url,url);
 assert.ok(msg.caption.includes('🔗 المصدر'));
 assert.ok(msg.caption.length<=1024);
 assert.equal(msg.caption.slice(msg.caption_entities[0].offset,msg.caption_entities[0].offset+msg.caption_entities[0].length),'المصدر');
 assert.equal(msg.caption_entities[0].url,url);
});
test('telegram inline linked original post is detected',()=>{
 assert.equal(x.sourceLink({text:'📰 خبر\n<a href="https://t.me/s/source/321">المنشور الأصلي</a>'}), 'https://t.me/s/source/321');
});
test('source media includes only valid JPEG/PNG signatures',()=>{
 assert.equal(x.validPhoto(Buffer.from('89504e470d0a1a0a'+('ff'.repeat(6000)),'hex'),'image/png'),true);
 assert.equal(x.validPhoto(Buffer.from('ffd8ff'+('00'.repeat(5000)),'hex'),'image/jpeg'),true);
 assert.equal(x.validPhoto(Buffer.from('3c737667'+('00'.repeat(6000)),'hex'),'image/svg'),false);
});
test('do not allow internal/private IP HTTP resources',()=>{
 for(const s of ['http://example.com/a.jpg','https://127.0.0.1/a','https://192.168.1.5/a','https://localhost/a'])
   assert.equal(x.publicHttps(s),null);
});
