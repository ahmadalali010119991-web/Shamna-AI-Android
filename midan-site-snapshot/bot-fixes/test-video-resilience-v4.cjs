'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
const originalLoad=Module._load;const store=new Map();
const blob={
 async put(path,data){store.set(path,data);return {url:'https://blob.mock/'+path,pathname:path}},
 async list({prefix}){return {blobs:[...store.keys()].filter(path=>path.startsWith(prefix)).map(path=>({pathname:path,url:'https://blob.mock/'+path}))}},
 async del(url){store.delete(url.replace('https://blob.mock/',''))}
};
Module._load=function(request,parent,isMain){if(request==='@vercel/blob')return blob;return originalLoad.apply(this,arguments)};
process.env.BLOB_READ_WRITE_TOKEN='mock-never-used';
process.env.TELEGRAM_BOT_TOKEN='999:mock_token';
const log=[];let mode='copy';
function response(data,status=200,headers={'content-type':'application/json'}){return new Response(typeof data==='string'?data:JSON.stringify(data),{status,headers})}
function html(id,video=true,url=false){return '<div data-post="suhebb0/'+id+'"><a class="tgme_widget_message_'+(video?'video_player':'photo_wrap')+'" href="https://t.me/suhebb0/'+id+'">SOURCE</a>'+(url?'<meta content="https://cdn4.telesco.pe/source.mp4">':'')+'</div>'}
const native=async function(url,init){
 const addr=String(url);log.push({mode,url:addr,body:typeof init?.body==='string'?init.body.slice(0,400):typeof init?.body});
 if(addr.startsWith('https://blob.mock/')){let str=store.get(addr.replace('https://blob.mock/',''));return response(str||'not found',str?200:404)}
 if(addr.includes('t.me/s/')){
  const before=Number(new URL(addr).searchParams.get('before')||0),id=before-1;
  if(addr.includes('maydan_alkhabar'))return response('<div data-post="maydan_alkhabar/552"><img src="photo"></div>',200,{'content-type':'text/html'});
  return response(html(id,true,['url','upload'].includes(mode)),200,{'content-type':'text/html'});
 }
 if(addr.includes('cdn4.telesco.pe/'))return response('abcd'.repeat(100),200,{'content-type':'video/mp4','content-length':'1600'});
 if(addr.includes('api.telegram.org/bot')){
  const op=addr.split('/').pop(),body=typeof init?.body==='string'?JSON.parse(init.body):null;
  if(op==='sendPhoto')return response({ok:true,result:{message_id:991,photo:[{}]}});
  if(op==='sendMessage')return response({ok:true,result:{message_id:992,text:'hi'}});
  if(op==='copyMessage'){
   if(mode==='copy')return response({ok:true,result:{message_id:601}});
   return response({ok:false,description:'copy blocked'},400);
  }
  if(op==='forwardMessage'){
   if(mode==='forward'||mode==='retry')return response({ok:true,result:{message_id:mode==='retry'?740:602,video:{file_id:'VIDEO_FILE'}}});
   return response({ok:false,description:'forward blocked'},400);
  }
  if(op==='editMessageCaption')return response({ok:true,result:{message_id:602,video:{file_id:'VIDEO_FILE'}}});
  if(op==='deleteMessage')return response({ok:true,result:true});
  if(op==='editMessageMedia')return response({ok:true,result:{message_id:552,video:{file_id:'VIDEO_FILE'}}});
  if(op==='sendVideo'){
   if(mode==='url'&&body?.video)return response({ok:true,result:{message_id:603,video:{file_id:'URL_VIDEO'}}});
   if(mode==='upload'&&init?.body instanceof FormData)return response({ok:true,result:{message_id:604,video:{file_id:'UPLOADED_VIDEO'}}});
   return response({ok:false,description:'route disabled'},400);
  }
  throw Error('unexpected telegram operation '+op);
 }
 throw Error('unexpected '+addr);
};
globalThis.fetch=native;
const router=require('./video-resilience-v4.js');router.install();
async function send(id){
 const r=await globalThis.fetch('https://api.telegram.org/bot999:mock_token/sendPhoto',
  {method:'POST',body:JSON.stringify({chat_id:'@maydan_alkhabar',photo:'thumb',caption:'نص الخبر',reply_markup:{inline_keyboard:[[{text:'اقرأ المصدر الأصلي',url:'https://t.me/suhebb0/'+id}]]}})});
 return r.json()
}
(async()=>{
 mode='copy';let a=await send(6001);assert.equal(a.result.message_id,601);assert(!log.some(x=>x.mode==='copy'&&x.url.endsWith('sendPhoto')));console.log('PASS native source copy');
 mode='forward';a=await send(6002);assert(a.result.video?.file_id);console.log('PASS native source forward with actual video metadata');
 mode='url';a=await send(6003);assert.equal(a.result.message_id,603);console.log('PASS Telegram fetches publisher-hosted MP4');
 mode='upload';a=await send(6004);assert.equal(a.result.message_id,604);console.log('PASS bounded multipart upload route');
 mode='fallback';a=await send(6005);assert.equal(a.result.message_id,991);
 assert([...store.keys()].some(k=>k.includes('6005-991.json')));console.log('PASS existing photo publisher preserved and pending repair recorded');
 mode='retry';const worker=await router.retryPending(native);
 assert(worker.scanned>0);
 assert([...store.keys()].includes('midan-media-retry/v4/done/voice-552.json'));
 assert(![...store.keys()].includes('midan-media-retry/v4/suhebb0-47987-552.json'));
 assert(log.some(x=>x.mode==='retry'&&x.url.endsWith('editMessageMedia')));
 assert(log.some(x=>x.mode==='retry'&&x.url.endsWith('deleteMessage')));
 console.log('PASS one-time incident 552 repaired in mock, temp deleted and done ledger persisted');
 const prior=log.filter(x=>x.mode==='retry'&&x.url.endsWith('editMessageMedia')).length;
 await router.retryPending(native);
 assert.equal(log.filter(x=>x.mode==='retry'&&x.url.endsWith('editMessageMedia')).length,prior);
 console.log('PASS idempotent second retry, no duplicate edit');
 console.log('TOTAL PASS: 7 resilience checks');
})().catch(e=>{console.error(e);process.exit(1)});
