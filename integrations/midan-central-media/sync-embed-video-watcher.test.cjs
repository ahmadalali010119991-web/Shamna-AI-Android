'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'midan-videos-sync-'));
try{
 const wrapper=fs.readFileSync(path.join(__dirname,'sync-embed-video-watcher.cjs'),'utf8');
 fs.writeFileSync(path.join(dir,'sync-v3-engine.js'),wrapper);
 fs.writeFileSync(path.join(dir,'sync-v3-engine-legacy.cjs'),
  "module.exports={run:async()=>({ok:true,sentNews:2,mediaRecovery:{ok:true}}),existing:true};");
 fs.writeFileSync(path.join(dir,'news-embed-video-buttons.js'),
  "module.exports={repair:async()=>({updated:[{messageId:625}],already:[637]})};");
 const sync=require(path.join(dir,'sync-v3-engine.js'));
 (async()=>{
  const r=await sync.run();
  assert.equal(r.ok,true);assert.equal(r.sentNews,2);
  assert.equal(r.mediaRecovery.ok,true);
  assert.equal(r.videoWatchButtons.updated[0].messageId,625);
  assert.equal(sync.existing,true);
  console.log('PASS: wrapper preserves sync result and adds video repair metadata');
 })().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
}catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e}
