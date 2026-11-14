'use strict';
const assert=require('node:assert/strict');
const {repair,videoWatchUrl,parseButtons}=require('./news-embed-video-buttons.cjs');
const source='https://www.france24.com/ar/video/20261113-example';
const article={id:'france24-story',sourceId:'france24-ar',url:source,title:'Example'};
const youtube='https://www.youtube-nocookie.com/embed/pyyVKhsRSDI';
const watch='https://www.youtube.com/watch?v=pyyVKhsRSDI';
const old='<a class="tgme_widget_message_inline_button url_button" href="https://midan-al-khabar.vercel.app/open.html"><span class="tgme_widget_message_inline_button_text">📲 افتح الخبر في ميدان الخبر</span></a>';
function block(id,oldButtons=old){
 return '<div class="tgme_widget_message_wrap"><div data-post="maydan_alkhabar/'+id+'"><div class="tgme_widget_message_text"><a href="'+source+'">الخبر في مصدره</a></div>'+oldButtons+'</div></div>';
}
assert.equal(videoWatchUrl({ok:true,kind:'embed',url:youtube}),watch);
assert.equal(videoWatchUrl({ok:true,kind:'embed',url:'https://evil.example.org/embed/pyyVKhsRSDI'}),null);
assert.equal(videoWatchUrl({ok:true,kind:'mp4',url:youtube}),null);
assert.equal(parseButtons(old).length,1);
let edits=[],first=true;
const f=async (url,opts={})=>{
 if(url.endsWith('/api/news'))return {ok:true,json:async()=>({articles:[article]})};
 if(url.includes('/api/news?videoFor='))return {ok:true,json:async()=>({ok:true,kind:'embed',url:youtube,source})};
 if(url.startsWith('https://t.me/s/'))return {ok:true,text:async()=>block(625,first?old:'<a class="tgme_widget_message_inline_button" href="'+watch+'"><span class="tgme_widget_message_inline_button_text">🎬 شاهد الفيديو الأصلي</span></a>'+old)};
 if(url.includes('/editMessageReplyMarkup')){
  const payload=JSON.parse(opts.body);edits.push(payload);first=false;
  return {ok:true,json:async()=>({ok:true,result:true})};
 }
 throw Error('Unexpected request '+url);
};
(async()=>{
 const a=await repair({fetcher:f,token:'test-only',maxEdits:2});
 assert.equal(a.updated.length,1);assert.equal(a.updated[0].messageId,625);
 assert.equal(edits.length,1);
 assert.equal(edits[0].message_id,625);
 assert.equal(edits[0].reply_markup.inline_keyboard.length,2);
 assert.equal(edits[0].reply_markup.inline_keyboard[0][0].url,watch);
 assert.equal(edits[0].reply_markup.inline_keyboard[1][0].url,'https://midan-al-khabar.vercel.app/open.html');
 const b=await repair({fetcher:f,token:'test-only',maxEdits:2});
 assert.equal(b.already.length,1);
 assert.equal(edits.length,1,'repeat run must not alter completed message');
 const withUnsafeVideo=await repair({fetcher:async(url,opts)=>{
  if(url.includes('videoFor'))return {ok:true,json:async()=>({ok:true,kind:'embed',url:'https://malicious.example.org/abc',source})};
  return f(url,opts)
 },token:'test-only'});
 assert.equal(withUnsafeVideo.updated.length,0);
 console.log('PASS: original watch-link repair, preserve existing button, correct source, no duplicate edits and malicious embeds rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
