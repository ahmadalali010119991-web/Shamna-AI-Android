'use strict';
const assert=require('node:assert/strict');
const {resolve,candidateFromHtml,playable}=require('./private-source99-site-video.cjs');
const id='private-source99-8',url='https://cdn4.telesco.pe/example.mp4';
const html='<div class="tgme_widget_message_wrap"><div data-post="Private_Source99/8"><i class="tgme_widget_message_video" data-video="'+url+'"></i></div></div>';
const prefix=Uint8Array.from([0,0,0,32,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50,0,0,0,0,0,0,0,0]);
const fetcher=async u=>{
 if(u==='https://t.me/s/Private_Source99')return {ok:true,status:200,text:async()=>html};
 if(u===url)return {status:206,redirected:false,headers:{get:k=>k==='content-type'?'video/mp4':k==='content-range'?'bytes 0-31/128000':null},
  body:new ReadableStream({start(controller){controller.enqueue(prefix);controller.close()}})};
 throw Error('unexpected URL '+u);
};
(async()=>{
 assert.equal(candidateFromHtml(html,8),url);
 assert.equal(candidateFromHtml(html,9),null);
 assert.equal(candidateFromHtml(html.replace('cdn4.telesco.pe','localhost'),8),null);
 const verified=await resolve(id,{fetcher,loadSource:async()=>[{id,sourceUrl:'https://t.me/Private_Source99/8',hasOriginalVideo:true}]});
 assert.equal(verified.kind,'mp4');assert.equal(verified.url,url);
 assert.equal(await resolve(id,{fetcher,loadSource:async()=>[{id,hasOriginalVideo:false}]}),null);
 assert.equal(await resolve('private-source99-9',{fetcher,loadSource:async()=>[]}),null);
 assert.equal(await playable(url,async()=>({status:403})),false);
 assert.equal(await playable(url,async()=>({status:200})),false);
 console.log('PASS: site source99 native MP4 extraction, public byte-range verification and safe fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
