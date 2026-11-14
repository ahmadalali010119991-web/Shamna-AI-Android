'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const quality=require('./original-photo-quality');
function png(width,height,bytes=5000){
 const b=Buffer.alloc(bytes);Buffer.from('89504e470d0a1a0a','hex').copy(b);
 b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);
 return b;
}
test('dimensions and mode preserve full-resolution bytes, cap oversized originals',()=>{
 const small=quality.admissible({buffer:png(800,700)});
 const big=quality.admissible({buffer:png(3200,2200)});
 assert.equal(quality.mode(small),'photo');assert.equal(quality.mode(big),'document');
 assert.equal(quality.choose([small,big]).pixels,7040000);
 assert.equal(quality.admissible({buffer:png(500,500,3000)}),null);
 assert.equal(quality.telegramPost('https://t.me/suhebb0/48013').id,48013);
 assert.equal(quality.telegramPost('https://t.me/s/suhebb0/48013').id,48013);
 assert.equal(quality.telegramPost('https://example.com/suhebb0/48013'),null);
});
test('exact Telegram post isolation never uses preceding or following message image',()=>{
 const html='<div data-post="suhebb0/48012">wrong<img src="wrong"></div>'+
 '<div data-post="suhebb0/48013">correct</div>'+
 '<div data-post="suhebb0/48014">next</div>';
 const scoped=quality.isolatedTelegramHtml(html,{channel:'suhebb0',id:48013});
 assert.match(scoped,/correct/);assert.doesNotMatch(scoped,/wrong|next/);
 assert.equal(quality.isolatedTelegramHtml(html,{channel:'suhebb0',id:48015}),null);
});
test('Telegram publisher chooses source-matched high-resolution document, not wrong neighbour',async()=>{
 const initial=globalThis.fetch;
 const pages=[];
 const imageUrl='https://images.example.org/real.png';
 const otherUrl='https://images.example.org/wrong.png';
 const source='https://t.me/suhebb0/48013';
 const html='<div data-post="suhebb0/48012"><a class="tgme_widget_message_photo_wrap" style="background-image:url(\''+otherUrl+'\')"></a></div>'+
 '<div data-post="suhebb0/48013"><a class="tgme_widget_message_photo_wrap" style="background-image:url(\''+imageUrl+'\')"></a></div>'+
 '<div data-post="suhebb0/48014"><a class="tgme_widget_message_photo_wrap" style="background-image:url(\''+otherUrl+'\')"></a></div>';
 const sent=[];
 globalThis.fetch=async(url,opts)=>{
  const s=String(url);
  if(s.startsWith('https://api.telegram.org/bot')){
   sent.push({url:s,opts});return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200,headers:{'content-type':'application/json'}});
  }
  pages.push(s);
  if(s.startsWith('https://t.me/'))return new Response(html,{status:200,headers:{'content-type':'text/html'}});
  if(s===imageUrl)return new Response(png(3200,2200,13000),{status:200,headers:{'content-type':'image/png'}});
  if(s===otherUrl)throw Error('wrong neighbour image must not be fetched');
  throw Error('unexpected URL: '+s);
 };
 try{
  const path=require.resolve('./news-original-photo');delete require.cache[path];
  const lib=require('./news-original-photo');
  const result=await lib.originalImage(source);
  assert.equal(result.delivery,'document');assert.equal(result.width,3200);
  assert.equal(pages.includes(otherUrl),false);
  lib.install();
  await globalThis.fetch('https://api.telegram.org/botTESTTOKEN/sendMessage',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    chat_id:'@maydan_alkhabar',
    text:'خبر مصوّر\n🔗 <a href="'+source+'">المنشور الأصلي</a>',
    reply_markup:{inline_keyboard:[[{text:'المصدر',url:source}]]}
   })
  });
  assert.equal(sent.length,1);assert.match(sent[0].url,/\/sendDocument$/);
  const form=sent[0].opts.body;
  assert.equal(form.get('chat_id'),'@maydan_alkhabar');
  assert.ok(form.get('document') instanceof Blob);
  assert.equal((await form.get('document').arrayBuffer()).byteLength,13000);
  assert.match(form.get('caption'),'المصدر');
  assert.equal(JSON.parse(form.get('reply_markup')).inline_keyboard[0][0].url,source);
 }finally{globalThis.fetch=initial;}
});
test('small image keeps ordinary Telegram inline photo presentation',async()=>{
 const initial=globalThis.fetch,source='https://example.org/article';
 const html='<meta property="og:image" content="https://images.example.org/inline.png">';
 const sent=[];
 globalThis.fetch=async (url,options)=>{
  const s=String(url);
  if(s.includes('/sendPhoto')){sent.push(s);return new Response('{"ok":true}')}
  if(s===source)return new Response(html,{status:200,headers:{'content-type':'text/html'}});
  if(s==='https://images.example.org/inline.png')return new Response(png(850,850),{status:200,headers:{'content-type':'image/png'}});
  throw Error(s);
 };
 try{
  const path=require.resolve('./news-original-photo');delete require.cache[path];
  const lib=require('./news-original-photo');lib.install();
  await globalThis.fetch('https://api.telegram.org/botTESTTOKEN/sendMessage',
   {method:'POST',body:JSON.stringify({chat_id:'@maydan_alkhabar',text:'خبر\n🔗 <a href="'+source+'">المصدر</a>'})});
  assert.equal(sent.length,1);
 }finally{globalThis.fetch=initial;}
});
