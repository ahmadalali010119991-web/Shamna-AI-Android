'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const repair=require('./retro-media-backfill.cjs'),verify=require('./retro-media-oidc.cjs');
const VIDEO=repair.video,CHAT='@maydan_alkhabar',ID=496;
const makeRes=()=>({code:200,setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});
test('backfill is one fixed telegram message only and preserves caption',()=>{
 assert.equal(ID,repair.messageId);
 assert.ok(VIDEO.includes('/SHD/'));
 assert.ok(repair.caption.includes('المصدر'));
 assert.ok(repair.caption.length<1024);
});
test('unsigned request is not accepted by GitHub OIDC verifier',async()=>assert.equal(await verify({headers:{}}),false));
test('one-time edit inserts source-verified playable video, never sends duplicates',async()=>{
 const old=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='FAKE_TEST';
 let editCalls=0,postBody=null;
 globalThis.fetch=async(url,options={})=>{
  let u=String(url);
  if(u.includes('t.me/s/maydan_alkhabar'))return new Response('<div data-post="maydan_alkhabar/496"><span>'+ 'غزة: دمار واسع داخل مستشفى ناصر بعد غارة إسرائيلية قاتلة'+'</span><time datetime="2026-11-12T16:10:00+00:00"></time></div>',{headers:{'content-type':'text/html'}});
  if(u===repair.source)return new Response('<meta property="og:video" content="'+VIDEO+'">',{headers:{'content-type':'text/html'}});
  if(u===VIDEO&&options.method==='HEAD')return new Response(null,{headers:{'content-length':'17102241'}});
  if(u.includes('/editMessageMedia')){editCalls++;postBody=JSON.parse(options.body);return new Response(JSON.stringify({ok:true,result:{message_id:ID,video:{file_id:'TEST_VIDEO_ID'}}}),{headers:{'content-type':'application/json'}})}
  throw Error('Unexpected request: '+u);
 };
 try{let r=makeRes();await repair({body:{}},r);assert.equal(r.code,200);assert.equal(r.body.ok,true);assert.equal(editCalls,1);assert.equal(postBody.message_id,ID);assert.equal(postBody.chat_id,CHAT);assert.equal(postBody.media.type,'video');assert.equal(postBody.media.media,VIDEO);assert.ok(postBody.media.caption.includes('يورونيوز'))}
 finally{globalThis.fetch=old;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
test('if old post already includes video, do not edit or re-upload anything',async()=>{
 const old=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='FAKE_TEST';
 let count=0;globalThis.fetch=async url=>{count++;if(!String(url).includes('t.me/s/maydan_alkhabar'))throw Error('Should not call source or Telegram');return new Response('<div data-post="maydan_alkhabar/496"><span>غزة: دمار واسع داخل مستشفى ناصر بعد غارة إسرائيلية قاتلة</span><div class="tgme_widget_message_video"></div><time datetime="2026-11-12T16:10:00+00:00"></time></div>')};
 try{let r=makeRes();await repair({body:{}},r);assert.equal(r.body.status,'already_has_video');assert.equal(count,1)}
 finally{globalThis.fetch=old;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
