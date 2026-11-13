'use strict';
const assert=require('node:assert/strict');
const {createDirectVideoRecovery}=require('./direct-video-recovery.cjs');
const page='https://source.example.org/article',asset='https://media.example.org/original.mp4';
const history=[];
const fake={
 discovery:{discover:async()=>[{kind:'video',uri:asset},{kind:'video',uri:'https://media.example.org/other.mp4'}]},
 downloader:{download:async ref=>{
  history.push('download:'+ref.uri);
  return {kind:'video',uri:ref.uri,verified:true,size:48,sha256:'a'.repeat(64),
   contentType:'video/mp4',bytes:new Uint8Array(48)};
 }},
 playback:{check:async value=>{
  history.push('playback:'+value.uri);
  assert.equal(value.bytes,undefined,'do not leak in-memory binary into playback/public metadata');
  return {...value,publiclyPlayable:true};
 }},
 canReuse:async()=>true,
 stableUrl:async u=>u===asset
};
(async()=>{
 const route=createDirectVideoRecovery(fake);
 const result=await route.run({sourceUrl:page});
 assert.equal(result.uri,asset);
 assert.equal(result.verified,true);
 assert.equal(result.publiclyPlayable,true);
 assert.equal(result.durability,'source-dependent');
 assert.equal(result.bytes,undefined);
 assert.deepEqual(history,['download:'+asset,'playback:'+asset]);
 const unauthorized=createDirectVideoRecovery({...fake,canReuse:async()=>false});
 await assert.rejects(()=>unauthorized.run({sourceUrl:page}),e=>e.permanent===true);
 const unstable=createDirectVideoRecovery({...fake,stableUrl:async()=>false});
 await assert.rejects(()=>unstable.run({sourceUrl:page}),/URL_UNSTABLE/);
 const refused=createDirectVideoRecovery({...fake,playback:{check:async()=>{throw Error('HTTP_403')}}});
 await assert.rejects(()=>refused.run({sourceUrl:page}),/DIRECT_VIDEO_RETRY/);
 const none=createDirectVideoRecovery({...fake,discovery:{discover:async()=>[]}});
 assert.equal(await none.run({sourceUrl:page}),null);
 assert.throws(()=>createDirectVideoRecovery({...fake,stableUrl:null}),/DIRECT_RECOVERY_DEPS_REQUIRED/);
 console.log('PASS: direct public original video, no Blob, permissions, stable URL and playback checks');
})().catch(e=>{console.error(e);process.exitCode=1});
