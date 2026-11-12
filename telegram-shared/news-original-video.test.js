'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const photo=require('./news-original-photo');
const original=globalThis.fetch;
let calls=[],pageVideo=true,videoAvailable=true,telegramSuccess=true;
const mp4=Buffer.alloc(300);mp4.write('ftypisom',4,'ascii');
const source='https://news.example.org/article';
const video='https://cdn.example.org/video.mp4';
function fakeFetch(input,init={}){
 const u=String(input?.url||input);calls.push({url:u,body:init.body,headers:init.headers});
 if(u===source)return Promise.resolve(new Response(pageVideo?'<meta property="og:video" content="'+video+'">':'<html>plain text</html>',{headers:{'content-type':'text/html'}}));
 if(u===video)return Promise.resolve(videoAvailable?new Response(mp4,{headers:{'content-type':'video/mp4'}}):new Response('not available',{status:404}));
 if(u.startsWith('https://api.telegram.org/botMOCK/'))return Promise.resolve(new Response(JSON.stringify({ok:telegramSuccess,result:{message_id:35,video:{file_id:'fileABC'}}}),{status:telegramSuccess?200:400,headers:{'content-type':'application/json'}}));
 throw Error('Unexpected URL: '+u);
}
async function setup(){
 calls=[];globalThis.fetch=fakeFetch;globalThis.__MIDAN_NEWS_RAW_FETCH=fakeFetch;
 delete globalThis.__MIDAN_ORIGINAL_VIDEO_INSTALLED;
 // Use a cache-cleared copy with the mock configured before module import.
 delete require.cache[require.resolve('./news-original-video')];
 const module=require('./news-original-video');
 module.install();
 return module;
}
const originalSend=()=>globalThis.fetch('https://api.telegram.org/botMOCK/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:'@channel',text:'منشور مهم\nالمصدر: '+source})});
test('Native MP4 video is attached to one Telegram post, no disk storage',async()=>{
 pageVideo=true;videoAvailable=true;telegramSuccess=true;await setup();
 const result=await originalSend();assert.equal(result.status,200);
 const sent=calls.find(x=>x.url.endsWith('/sendVideo'));
 assert.ok(sent,'sendVideo not invoked');assert.ok(sent.body.get('video') instanceof Blob);
 assert.ok(sent.body.get('caption').includes('منشور مهم'));
 assert.ok(sent.body.get('caption_entities').includes(source));
 assert.equal(calls.filter(x=>x.url.endsWith('/sendMessage')).length,0);
 globalThis.fetch=original;
});
test('Article without video is unchanged',async()=>{
 pageVideo=false;await setup();await originalSend();
 assert.equal(calls.filter(x=>x.url.endsWith('/sendVideo')).length,0);
 assert.equal(calls.filter(x=>x.url.endsWith('/sendMessage')).length,1);
 globalThis.fetch=original;
});
test('Unreachable video gracefully falls back instead of claiming a video was posted',async()=>{
 pageVideo=true;videoAvailable=false;await setup();await originalSend();
 assert.equal(calls.filter(x=>x.url.endsWith('/sendVideo')).length,0);
 assert.equal(calls.filter(x=>x.url.endsWith('/sendMessage')).length,1);
 globalThis.fetch=original;
});
test('Long caption retains complete text in a reply',async()=>{
 pageVideo=true;videoAvailable=true;await setup();
 const big='خبر '.repeat(300)+'\nالمصدر: '+source;
 await globalThis.fetch('https://api.telegram.org/botMOCK/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:'@channel',text:big})});
 const videoReq=calls.find(x=>x.url.endsWith('/sendVideo'));
 const fullReq=calls.find(x=>x.url.endsWith('/sendMessage'));
 assert.ok(videoReq,'video request missing');assert.ok(videoReq.body.get('caption').length<=1024);
 assert.ok(fullReq,'long article follow-up missing');assert.ok(JSON.parse(fullReq.body).text.includes('خبر'));
 globalThis.fetch=original;
});
