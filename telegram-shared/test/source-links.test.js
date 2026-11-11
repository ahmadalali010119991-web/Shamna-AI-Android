'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {transformPayload,interceptRequest,transformString}=require('../telegram-source-links');
const link='https://www.aa.com.tr/ar/%D8%A7%D9%84%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1/12345';
test('convert screenshot-style source link into original destination text_link',()=>{
 const p={chat_id:'-1004321446340',text:'📰 خبر عاجل\n\nالتفاصيل موجودة هنا.\n\n🔗 '+link};
 assert.equal(transformPayload(p),true);
 assert.ok(p.text.endsWith('🔗 المصدر'));
 assert.equal(p.entities.length,1);
 const entity=p.entities[0];
 assert.equal(entity.url,link);assert.equal(p.text.slice(entity.offset,entity.offset+entity.length),'المصدر');
});
test('preserve HTML formatting in captions, substitute hyperlink',()=>{
 const p={parse_mode:'HTML',caption:'<b>عنوان مهم</b>\nمتن الخبر\n🔗 '+link};
 assert.equal(transformPayload(p),true);
 assert.match(p.caption,/<b>عنوان مهم<\/b>/);
 assert.match(p.caption,/<a href="https:\/\/www.aa.com.tr\/ar\//);
 assert.ok(p.caption.endsWith('المصدر</a>'));
 assert.equal(p.parse_mode,'HTML');
});
test('do not alter links without source marker, social links or captions without URLs',()=>{
 for(const t of ['تابعنا https://t.me/maydan_alkhabar','🪙 أسعار الذهب في سوريا','رابط التطبيق: https://github.com/example']) {
  const p={text:t};assert.equal(transformPayload(p),false);assert.equal(p.text,t);
 }
});
test('reject malformed/private source URLs',()=>{
 const p={text:'النص\n🔗 http://127.0.0.1/internal'};
 assert.equal(transformPayload(p),false);
});
test('JSON Bot API request is rewritten without dropping publication fields',()=>{
 const input={method:'POST',body:JSON.stringify({chat_id:'@maydan_alkhabar',disable_notification:true,caption:'خبر\n🔗 '+link})};
 const x=interceptRequest('https://api.telegram.org/botREDACTED/sendPhoto',input);
 assert.ok(x);
 const p=JSON.parse(x.body);
 assert.equal(p.chat_id,'@maydan_alkhabar');
 assert.equal(p.disable_notification,true);
 assert.equal(p.caption_entities[0].url,link);
});
test('Multipart keeps binary media untouched while source becomes text_link',()=>{
 const old=new FormData();old.set('chat_id','@maydan_alkhabar');
 old.set('photo',new Blob(['testbytes'],{type:'image/png'}),'sample.png');
 old.set('caption','خبر\n🔗 '+link);
 const output=interceptRequest('https://api.telegram.org/botREDACTED/sendPhoto',
  {method:'POST',headers:{'content-type':'multipart/form-data; boundary=old'},body:old});
 assert.ok(output);assert.equal(output.body.get('photo').size,9);
 assert.equal(JSON.parse(output.body.get('caption_entities'))[0].url,link);
 assert.equal(output.headers.get('content-type'),null);
});
test('do not modify messages using unsupported Markdown parser',()=>{
 const p={parse_mode:'MarkdownV2',text:'📰 خبر\n🔗 '+link};
 assert.equal(transformPayload(p),false);
});
