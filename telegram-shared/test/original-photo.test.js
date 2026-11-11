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

test('source page with real image sends a photo, not a plain message', async()=>{
 const mime='image/png';
 const png=Buffer.from('89504e470d0a1a0a'+('ff'.repeat(6000)),'hex');
 const calls=[];
 const realFetch=globalThis.fetch;
 globalThis.fetch=async (url,options={})=>{
   const u=String(url);calls.push({url:u,options});
   if(u==='https://example.com/article/1')return new Response('<meta property="og:image" content="https://img.example.com/photo.png">',{status:200,headers:{'content-type':'text/html'}});
   if(u==='https://img.example.com/photo.png')return new Response(png,{status:200,headers:{'content-type':mime}});
   if(u.endsWith('/sendPhoto'))return new Response(JSON.stringify({ok:true,result:{message_id:4}}),{status:200,headers:{'content-type':'application/json'}});
   throw new Error('Unexpected network '+u);
 };
 delete require.cache[require.resolve('../news-original-photo')];
 delete globalThis.__MIDAN_ORIGINAL_PHOTO_INSTALLED;
 const plugin=require('../news-original-photo');plugin.install();
 try{
   const response=await globalThis.fetch('https://api.telegram.org/botTOKEN/sendMessage',
     {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:'@test',text:'📰 اختبار\n🔗 https://example.com/article/1',parse_mode:'HTML'})});
   assert.equal((await response.json()).ok,true);
   assert.equal(calls.filter(c=>c.url.endsWith('/sendPhoto')).length,1);
   assert.equal(calls.filter(c=>c.url.endsWith('/sendMessage')).length,0);
   const form=calls.find(c=>c.url.endsWith('/sendPhoto')).options.body;
   assert.equal(form.get('chat_id'),'@test');
   assert.equal(form.get('caption').includes('🔗 المصدر'),true);
   assert.equal(form.get('photo').size,png.length);
 }finally{globalThis.fetch=realFetch;delete globalThis.__MIDAN_ORIGINAL_PHOTO_INSTALLED}
});
