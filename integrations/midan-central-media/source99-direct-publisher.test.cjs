'use strict';
const assert=require('node:assert/strict');
const {createSource99Publisher,extractMedia}=require('./source99-direct-publisher.cjs');
const posts=[6,7].map(id=>({
 id:'private-source99-'+id,title:'خبر القامشلي '+id,
 sourceId:'private-source99',sourceUrl:'https://t.me/Private_Source99/'+id,
 hasOriginalPhoto:true,hasOriginalVideo:false,editorialApproved:true
}));
const html=posts.map(p=>
 '<div class="tgme_widget_message_wrap" data-post="Private_Source99/'+p.id.split('-').at(-1)+'">'+
 '<div class="tgme_widget_message" data-post="Private_Source99/'+p.id.split('-').at(-1)+'">'+
 '<a class="tgme_widget_message_photo_wrap" style="background-image:url(\'https://cdn.example.org/'+p.id+'.jpg\')"></a></div></div>'
).join('');
assert.ok(extractMedia(html,6,'photo').includes('/private-source99-6.jpg'));
assert.ok(extractMedia(html,7,'photo').includes('/private-source99-7.jpg'));
assert.equal(extractMedia(html,5,'photo'),null);

const telegramVideo='<div class="tgme_widget_message_wrap">'+
 '<div class="tgme_widget_message" data-post="Private_Source99/8">'+
 '<div class="tgme_widget_message_video_player">'+
 '<i class="tgme_widget_message_video" data-video="https://media.example.org/real.mp4"></i></div></div></div>';
assert.equal(extractMedia(telegramVideo,8,'video'),'https://media.example.org/real.mp4');
const nestedVideo='<div class="tgme_widget_message_wrap" data-post="Private_Source99/9">'+
 '<video class="tgme_widget_message_video" controls><source src="https://media.example.org/nested.mp4"></video></div>';
assert.equal(extractMedia(nestedVideo,9,'video'),'https://media.example.org/nested.mp4');

const state=new Map(),deliveries=[];
const once=async(key,send)=>{
 if(state.has(key))return {status:'duplicate'};
 const delivered=await send();
 const result={status:'sent',receipt:{message_id:delivered.message_id}};
 state.set(key,result);return result;
};
const jpg=new Uint8Array([255,216,255,224,1,2,3,4]);
const fetcher=async(url,options={})=>{
 if(url.includes('midan-al-khabar.vercel.app'))return {ok:true,json:async()=>({articles:posts})};
 if(url==='https://t.me/s/Private_Source99')return {ok:true,text:async()=>html};
 if(url.startsWith('https://cdn.example.org/'))return {
  ok:true,status:200,headers:{get:k=>k==='content-type'?'image/jpeg':null},
  arrayBuffer:async()=>jpg.buffer
 };
 if(url.startsWith('https://api.telegram.org/bot')){
  const method=url.split('/').at(-1);
  deliveries.push({method,photo:options.body.get('photo'),caption:options.body.get('caption')});
  return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:200+deliveries.length,chat:{id:-123}}})};
 }
 throw Error('Unexpected URL '+url);
};
(async()=>{
 const publisher=createSource99Publisher({fetcher,once,botToken:'test-only-token'});
 const first=await publisher.run();
 assert.equal(first.total,2);assert.deepEqual(first.results.map(x=>x.status),['sent','sent']);
 assert.equal(deliveries.length,2);
 assert.ok(deliveries.every(x=>x.method==='sendPhoto'));
 assert.ok(deliveries.every(x=>x.photo instanceof Blob));
 assert.ok(deliveries.every(x=>x.caption.includes('المصدر الأصلي')));
 const second=await publisher.run();
 assert.equal(second.total,2);assert.deepEqual(second.results.map(x=>x.status),['duplicate','duplicate']);
 assert.equal(deliveries.length,2,'idempotent duplicate guard');
 const broken=createSource99Publisher({fetcher:async(url,opts)=>{
  if(url.includes('midan-al-khabar'))return {ok:true,json:async()=>({articles:[{...posts[0],id:'private-source99-8',sourceUrl:'https://t.me/Private_Source99/8'}]})};
  if(url==='https://t.me/s/Private_Source99')return {ok:true,text:async()=>html};
  throw Error('must not send fallback text');
 },once:async (_,fn)=>fn(),botToken:'test-only-token'});
 const failure=await broken.run();
 assert.equal(failure.results[0].status,'retry');
 assert.equal(failure.results[0].error,'ORIGINAL_MEDIA_NOT_FOUND');

 const videoPost={...posts[0],id:'private-source99-8',
   sourceUrl:'https://t.me/Private_Source99/8',
   hasOriginalVideo:true,hasOriginalPhoto:false};
 const mp4=Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,0]);
 let videoCalls=[];
 const videoFetch=async (url,options={})=>{
   if(url.includes('midan-al-khabar.vercel.app'))
    return {ok:true,json:async()=>({articles:[videoPost]})};
   if(url==='https://t.me/s/Private_Source99')
    return {ok:true,text:async()=>telegramVideo};
   if(url==='https://media.example.org/real.mp4')
    return {ok:true,status:200,headers:{get:k=>k==='content-type'?'video/mp4':null},
      arrayBuffer:async()=>mp4.buffer};
   if(url.includes('api.telegram.org')){
    videoCalls.push({url,body:options.body});
    return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:980,chat:{id:-123}}})};
   }
   throw Error('Unexpected video test URL '+url);
 };
 const videoPublisher=createSource99Publisher({fetcher:videoFetch,once:async (_key,send)=>{
  const msg=await send();return {status:'sent',receipt:{message_id:msg.message_id}};
 },botToken:'test-only-token'});
 const videoResult=await videoPublisher.run();
 assert.equal(videoResult.results[0].status,'sent');
 assert.equal(videoCalls.length,1);
 assert.ok(videoCalls[0].url.endsWith('/sendVideo'));
 assert.ok(videoCalls[0].body.get('video') instanceof Blob);
 assert.ok(videoCalls[0].body.get('caption').includes('المصدر الأصلي'));

 console.log('PASS: Source99 photo+MP4 video upload, canonical post matching, atomic dedup and no silent photo-to-text fallback');
})().catch(e=>{console.error(e);process.exitCode=1});
