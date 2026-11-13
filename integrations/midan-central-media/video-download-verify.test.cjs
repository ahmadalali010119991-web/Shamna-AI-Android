'use strict';
const assert=require('node:assert/strict');
const {createVideoDownloader,checkedUrl,validSignature}=require('./video-download-verify.cjs');
const host='cdn.example.org',uri='https://cdn.example.org/real-video.mp4';
const mp4=new Uint8Array([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,109,112,52,50,0,0,0,8,109,100,97,116]);
function response(bytes,{type='video/mp4',size=bytes.length,status=200,redirected=false}={}){
 return {status,redirected,headers:{get(k){return k==='content-type'?type:k==='content-length'?String(size):null}},
  body:new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,12));controller.enqueue(bytes.slice(12));controller.close()}})};
}
function maker(get,opts={}){return createVideoDownloader({allowedHosts:[host],fetcher:async(_url,options)=>{assert.equal(options.redirect,'manual');return get()},...opts})}
(async()=>{
 const candidate={kind:'video',uri,verified:false};
 const ok=await maker(()=>response(mp4)).download(candidate);
 assert.equal(ok.verified,true);
 assert.equal(ok.contentType,'video/mp4');
 assert.equal(ok.bytes.byteLength,mp4.length);
 assert.match(ok.sha256,/^[a-f0-9]{64}$/);
 assert.equal(ok.uri,uri);
 assert.equal(validSignature(mp4,'video/mp4'),true);
 assert.equal(validSignature(new Uint8Array(27),'video/mp4'),false);
 const webm=Uint8Array.from([26,69,223,163,...new Array(20).fill(1)]);
 assert.equal(validSignature(webm,'video/webm'),true);
 await assert.rejects(()=>maker(()=>response(mp4,{type:'text/html'})).download(candidate),/CONTENT_TYPE/);
 await assert.rejects(()=>maker(()=>response(new Uint8Array(28))).download(candidate),/SIGNATURE/);
 await assert.rejects(()=>maker(()=>response(mp4,{size:mp4.length+1})).download(candidate),/LENGTH_MISMATCH/);
 await assert.rejects(()=>maker(()=>response(mp4,{redirected:true})).download(candidate),/FETCH_FAILED/);
 await assert.rejects(()=>maker(()=>response(mp4,{status:403})).download(candidate),/FETCH_FAILED/);
 await assert.rejects(()=>maker(()=>response(mp4),{maxBytes:24}).download(candidate),/TOO_LARGE/);
 await assert.rejects(()=>maker(()=>response(mp4,{size:99}),{maxBytes:50}).download(candidate),/TOO_LARGE/);
 await assert.rejects(()=>maker(()=>response(mp4)).download({kind:'photo',uri}),/CANDIDATE/);
 assert.throws(()=>checkedUrl('http://cdn.example.org/real-video.mp4',[host]),/INVALID_VIDEO_URL/);
 assert.throws(()=>checkedUrl('https://127.0.0.1/private.mp4',[host]),/NOT_ALLOWED/);
 assert.throws(()=>checkedUrl('https://another.example.org/x.mp4',[host]),/NOT_ALLOWED/);
 assert.throws(()=>checkedUrl('https://cdn.example.org:444/a.mp4',[host]),/INVALID_VIDEO_URL/);
 console.log('PASS: secure binary stream verification, size cap, allowlist and content authenticity guard');
})().catch(e=>{console.error(e);process.exitCode=1});
