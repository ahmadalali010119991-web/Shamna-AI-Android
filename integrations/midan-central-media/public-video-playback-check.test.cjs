'use strict';
const assert=require('node:assert/strict');
const {createPublicVideoPlaybackCheck}=require('./public-video-playback-check.cjs');
const size=1128375;
const prefix=Uint8Array.from([0,0,0,32,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50,0,0,0,0,0,0,0,0]);
const url='https://public.blob.vercel-storage.com/midan/video.mp4';
const item={kind:'video',verified:true,uri:url,size,contentType:'video/mp4',sha256:'a'.repeat(64)};
function resp({status,headers={},body=null,redirected=false}){
 return {status,redirected,headers:{get:k=>headers[k.toLowerCase()]||null},
  body:body===null?null:new ReadableStream({start(ctrl){ctrl.enqueue(body);ctrl.close()}})};
}
const ok=async (_url,opts)=>{
 assert.equal(_url,url);
 assert.equal(opts.redirect,'manual');
 assert.ok(!opts.headers?.Authorization);
 if(opts.method==='HEAD')return resp({status:200,headers:{'content-length':size.toString(),'content-type':'video/mp4'}});
 if(opts.method==='GET'){
  assert.equal(opts.headers.Range,'bytes=0-31');
  return resp({status:206,headers:{'content-range':'bytes 0-31/'+size},body:prefix});
 }
 throw Error('unsupported');
};
(async()=>{
 const checker=createPublicVideoPlaybackCheck({allowedHosts:['public.blob.vercel-storage.com'],fetcher:ok});
 const playable=await checker.check(item);
 assert.equal(playable.publiclyPlayable,true);
 assert.equal(playable.sha256,item.sha256);
 const denied=createPublicVideoPlaybackCheck({allowedHosts:['public.blob.vercel-storage.com'],fetcher:async()=>resp({status:403})});
 await assert.rejects(()=>denied.check(item),/HEAD_FAILED/);
 const rangeBlocked=createPublicVideoPlaybackCheck({allowedHosts:['public.blob.vercel-storage.com'],fetcher:async(_u,opts)=>
  opts.method==='HEAD'
    ?resp({status:200,headers:{'content-length':String(size),'content-type':'video/mp4'}})
    :resp({status:200,body:prefix})});
 await assert.rejects(()=>rangeBlocked.check(item),/RANGE_UNAVAILABLE/);
 const badMedia=createPublicVideoPlaybackCheck({allowedHosts:['public.blob.vercel-storage.com'],fetcher:async(_u,opts)=>
  opts.method==='HEAD'
    ?resp({status:200,headers:{'content-length':String(size),'content-type':'video/mp4'}})
    :resp({status:206,headers:{'content-range':'bytes 0-31/'+size},body:Uint8Array.from([...prefix.slice(0,4),0,...prefix.slice(5)])})});
 await assert.rejects(()=>badMedia.check(item),/SIGNATURE_INVALID/);
 const wrongSize=createPublicVideoPlaybackCheck({allowedHosts:['public.blob.vercel-storage.com'],fetcher:async()=>resp({status:200,headers:{'content-length':'88','content-type':'video/mp4'}})});
 await assert.rejects(()=>wrongSize.check(item),/LENGTH_MISMATCH/);
 await assert.rejects(()=>checker.check({...item,uri:'https://attacker.example.com/x.mp4'}),/HOST_NOT_ALLOWED/);
 await assert.rejects(()=>checker.check({...item,verified:false}),/VERIFIED_VIDEO_REQUIRED/);
 console.log('PASS: video public no-token HEAD, 206 byte-range playback, signature, and fail-closed access');
})().catch(e=>{console.error(e);process.exitCode=1});
