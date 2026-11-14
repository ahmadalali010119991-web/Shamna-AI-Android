'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'video-watch-cadence.cjs'),'utf8');
test('optional video watcher throttles only its own requests; news always syncs',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'midan-watch-cadence-'));
 const NativeDate=globalThis.Date;
 try{
  fs.writeFileSync(path.join(temp,'sync-v3-engine.js'),src);
  fs.writeFileSync(path.join(temp,'sync-v3-engine-legacy.cjs'),
   "module.exports={run:async()=>({ok:true,sentNews:globalThis.__testSentNews})}");
  fs.writeFileSync(path.join(temp,'news-embed-video-buttons.js'),
   "module.exports={repair:async()=>{globalThis.__testWatchCount++;return {updated:[]}}}");
  globalThis.__testSentNews=0;globalThis.__testWatchCount=0;
  class FakeDate extends NativeDate{
   constructor(...args){super(...(args.length?args:['2026-11-14T00:01:00.000Z']))}
  }
  globalThis.Date=FakeDate;
  const engine=require(path.join(temp,'sync-v3-engine.js'));
  let out=await engine.run();
  assert.equal(out.ok,true);assert.equal(out.videoWatchButtons.skipped,'10_minute_window');
  assert.equal(globalThis.__testWatchCount,0);
  globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-11-14T00:10:00.000Z']))}};
  out=await engine.run();
  assert.deepEqual(out.videoWatchButtons,{updated:[]});
  assert.equal(globalThis.__testWatchCount,1);
  globalThis.__testSentNews=1;globalThis.Date=FakeDate;
  out=await engine.run();
  assert.equal(out.ok,true);assert.equal(globalThis.__testWatchCount,2);
 }finally{
  globalThis.Date=NativeDate;delete globalThis.__testSentNews;delete globalThis.__testWatchCount;
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
