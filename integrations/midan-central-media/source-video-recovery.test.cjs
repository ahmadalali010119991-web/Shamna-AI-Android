'use strict';
const assert=require('node:assert/strict');
const {createSourceVideoRecovery}=require('./source-video-recovery.cjs');
const article={id:'article1',sourceUrl:'https://publisher.example.org/story'};
const refs=[{kind:'video',uri:'https://cdn.example.org/broken.mp4'},
 {kind:'video',uri:'https://cdn.example.org/working.mp4'}];
let downloads=[],saves=[];
const discovery={discover:async url=>{assert.equal(url,article.sourceUrl);return refs}};
const downloader={download:async ref=>{
 downloads.push(ref.uri);
 if(ref.uri.includes('broken'))throw Error('MEDIA_403');
 return {kind:'video',uri:ref.uri,verified:true,sha256:'a'.repeat(64),size:25,contentType:'video/mp4',bytes:new Uint8Array(25)};
}};
const store={persist:async video=>{saves.push(video.uri);
 return {kind:'video',uri:'https://cdn-storage.example.org/sha.mp4',verified:true}}};
(async()=>{
 const r=createSourceVideoRecovery({discovery,downloader,store,canReuse:async()=>true});
 assert.equal(r.id,'source-discovered-video-to-durable-store');
 const final=await r.run(article);
 assert.equal(final.uri,'https://cdn-storage.example.org/sha.mp4');
 assert.equal(downloads.length,2);
 assert.equal(saves.length,1);
 const noLicense=createSourceVideoRecovery({discovery,downloader,store,canReuse:async()=>false});
 await assert.rejects(()=>noLicense.run(article),e=>e.permanent===true);
 const noVideo=createSourceVideoRecovery({discovery:{discover:async()=>[]},downloader,store,canReuse:async()=>true});
 assert.equal(await noVideo.run(article),null);
 const fails=createSourceVideoRecovery({discovery:{discover:async()=>[refs[0]]},downloader,store,canReuse:async()=>true});
 await assert.rejects(()=>fails.run(article),/RECOVERY_RETRY/);
 assert.throws(()=>createSourceVideoRecovery({discovery,downloader,store}),/DEPENDENCIES/);
 console.log('PASS: source->video->verified store, alternate candidate recovery, strict reuse and temporary retry');
})().catch(e=>{console.error(e);process.exitCode=1});
