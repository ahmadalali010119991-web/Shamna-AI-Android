'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('./article-video-api.cjs');
test('source media embeds from YouTube are safe playable players',()=>{
 let html='<meta property="og:video" content="https://www.youtube.com/embed/o1zLeuKnM3k" />';
 assert.deepEqual(handler.extract(html,'https://sana.sy/photos/2633438/'),{kind:'embed',url:'https://www.youtube-nocookie.com/embed/o1zLeuKnM3k'});
});
test('Euronews published MP4 is recognized as native inline video',()=>{
 let html='<meta property="og:video" content="https://video.euronews.com/mp4/FHD/test.mp4" />';
 assert.deepEqual(handler.extract(html,'https://arabic.euronews.com/video/story'),{kind:'mp4',url:'https://video.euronews.com/mp4/FHD/test.mp4'});
});
test('no video is not incorrectly labeled as a video',()=>{
 assert.equal(handler.extract('<h1>تقرير محلي بلا فيديو</h1>','https://sana.sy/locals/123/'),null);
});
test('private and dangerous URLs are rejected',()=>{
 for(const value of ['http://localhost/video.mp4','https://127.0.0.1/private.mp4','https://10.3.2.1/secret.mp4','file:///etc/passwd','https://user:secret@sana.sy/locals/1'])assert.equal(handler.safeHttps(value),null,value);
});
test('unknown id never initiates source-page fetch',async()=>{
 let calls=0;const prior=globalThis.fetch;globalThis.fetch=async(u)=>{calls++;assert.equal(String(u),'https://midan-al-khabar.vercel.app/api/news');return new Response(JSON.stringify({articles:[]}),{headers:{'content-type':'application/json'}})};
 const result={statusCode:null,setHeader(){},status(n){this.statusCode=n;return this},json(obj){this.body=obj;return this}};
 try{await handler({method:'GET',query:{id:'not_existing_article'}},result);assert.equal(result.body.ok,false);assert.equal(result.body.reason,'not_published');assert.equal(calls>=1,true)}
 finally{globalThis.fetch=prior}
});
