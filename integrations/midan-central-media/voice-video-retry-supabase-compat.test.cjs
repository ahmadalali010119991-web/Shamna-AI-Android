'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'midan-retry-fallback-'));
const compat=fs.readFileSync(path.join(__dirname,'voice-video-retry-supabase-compat.cjs'),'utf8');
const legacy=[
 "'use strict';",
 "const RETRY_PREFIX='midan-media-retry/v4/';",

 "async function retryUsingSupabase(){const state=require('./state-v3');const data={};const result=await state.write(STATE_QUEUE_KEY,data);return result}",
 "const STATE_QUEUE_KEY='midan_media_video_retries_v4';",
 "const blobAPI=()=>globalThis.__testBlob||null;",
 "const captionOf=data=>String(data.caption||'');",
 "async function recordPending(src,data,targetMessageId,reasons,extra={}){",
 " if(!process.env.BLOB_READ_WRITE_TOKEN||!targetMessageId)return false;",
 " const blob=blobAPI();if(!blob)return false;",
 " const record={schema:4,source:src.url,channel:src.channel,sourceId:src.id,destination:data.chat_id,targetMessageId:Number(targetMessageId),",
 "  attempts:0,nextRetry:Date.now()+300000,createdAt:Date.now(),errors:reasons.slice(-6),caption:captionOf(data)?.slice(0,1024)||'',parse_mode:data.parse_mode||'',reply_markup:data.reply_markup||null,...extra};",
 " try{",
 "  await blob.put(RETRY_PREFIX+src.channel+'-'+src.id+'-'+targetMessageId+'.json',JSON.stringify(record),",
 "   {access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});",
 "  return true;",
 " }catch(e){console.warn('Midan media retry ledger unavailable:',String(e.message||e).slice(0,100));return false}",
 "}",
 "module.exports={recordPending};"
].join('\n');
const fakeState=[
 "'use strict';",
 "let value=null,writes=0,version=0,fail=false,delayOne=false,conflicts=0;",
 "module.exports={",
 " read:async()=>value?{value:structuredClone(value),updated_at:String(version)}:null,",
 " call:async(op,key,newValue,options={})=>{",
 "  if(op!=='write'||key!=='state/v3-media-video-retries-v4')throw Error('wrong operation');",
 "  if(delayOne){delayOne=false;await new Promise(r=>setTimeout(r,20))}",
 "  if(fail)return {ok:false};",
 "  const expected=options.expected_updated_at??null;",
 "  if(expected!==(value?String(version):null)){conflicts++;return {ok:false,conflict:true}}",
 "  value=structuredClone(newValue);version++;writes++;return {ok:true};",
 " },",
 " peek:()=>value,count:()=>writes,conflicts:()=>conflicts,delay:()=>{delayOne=true},",
 " reset:()=>{value=null;writes=0;version=0;fail=false;delayOne=false;conflicts=0},",
 " failure:yes=>{fail=yes}",
 "};"
].join('\n');
(async()=>{
 try{
  fs.writeFileSync(path.join(root,'voice-video-first.js'),compat);
  fs.writeFileSync(path.join(root,'voice-video-first-legacy.cjs'),legacy);
  fs.writeFileSync(path.join(root,'state-v3.js'),fakeState);
  const state=require(path.join(root,'state-v3.js'));
  const fn=require(path.join(root,'voice-video-first.js')).recordPending;
  const source={url:'https://t.me/suhebb0/47990',channel:'suhebb0',id:47990};
  const args={chat_id:'@maydan_alkhabar',caption:'Original caption',parse_mode:'HTML'};
  const first=await fn(source,args,901,['source_video_unavailable']);
  assert.equal(first,true,'suspended Blob triggers Supabase fallback');
  const queued=state.peek();
  assert.equal(queued.schema,4);
  assert.equal(Object.keys(queued.jobs).length,1);
  const job=queued.jobs['suhebb0:47990:901'];
  assert.equal(job.targetMessageId,901);
  assert.equal(job.sourceId,47990);
  assert.equal(job.destination,args.chat_id);
  assert.equal(job.caption,args.caption);
  assert.equal(job.attempts,0);
  assert.ok(job.nextRetry>Date.now());
  assert.equal(state.count(),1);
  assert.equal(await fn(source,args,901,['repeated']),true);
  assert.equal(state.count(),1,'do not overwrite pending job');
  assert.equal(await fn(source,args,902,['second']),true);
  assert.equal(Object.keys(state.peek().jobs).length,2);
  assert.equal(await fn(source,args,null,['bad']),false);
  assert.equal(Object.keys(state.peek().jobs).length,2);
  state.failure(true);
  assert.equal(await fn(source,args,903,['third']),false,'reject unconfirmed persistence');
  state.failure(false);
  let blobs=0;
  process.env.BLOB_READ_WRITE_TOKEN='test-only-token';
  globalThis.__testBlob={put:async()=>{blobs++}};
  assert.equal(await fn(source,args,904,[]),true);
  assert.equal(blobs,1);
  assert.equal(Object.keys(state.peek().jobs).length,2,'Blob happy path unchanged');
  globalThis.__testBlob={put:async()=>{throw Error('limits-exceeded-suspended')}};
  assert.equal(await fn(source,args,905,['failing_blob']),true);
  assert.equal(Object.keys(state.peek().jobs).length,3);
  state.delay();
  const concurrent=await Promise.all([
    fn(source,args,906,['failure_a']),
    fn(source,args,907,['failure_b'])
  ]);
  assert.deepEqual(concurrent,[true,true]);
  assert.equal(Object.keys(state.peek().jobs).length,5,'both concurrent retries preserved');
  assert.ok(state.peek().jobs['suhebb0:47990:906']);
  assert.ok(state.peek().jobs['suhebb0:47990:907']);
  assert.ok(state.conflicts()>0,'forced conflict must exercise revision retry');
  const duplicateWrites=state.count();
  const duplicates=await Promise.all([
    fn(source,args,906,['duplicate_a']),
    fn(source,args,906,['duplicate_b'])
  ]);
  assert.deepEqual(duplicates,[true,true]);
  assert.equal(state.count(),duplicateWrites,'same pending job not overwritten');
  assert.equal(Object.keys(state.peek().jobs).length,5);
  console.log('PASS: suspended Blob durable CAS fallback, concurrent distinct jobs preserved, duplicate jobs deduplicated');
 }finally{delete process.env.BLOB_READ_WRITE_TOKEN;delete globalThis.__testBlob;fs.rmSync(root,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
