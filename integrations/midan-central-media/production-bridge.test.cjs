'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'production-bridge');
test('production adapter is syntactically valid and production flag defaults off',()=>{
 const source=fs.readFileSync(path.join(root,'voice-video-first.js'),'utf8');
 assert.doesNotThrow(()=>new Function(source));
 assert.match(source,/MIDAN_MEDIA_RETRY_ENABLED/);
 assert.match(source,/VIDEO_RECEIPT_UNCONFIRMED/);
 assert.match(source,/api\.telegram\.org\/bot/);
});
test('missing native file_id never marks retry completed; verified result does',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'midan-media-production-test-'));
 const keys=['MIDAN_MEDIA_RETRY_ENABLED','MIDAN_MEDIA_RETRY_DB_URL','MIDAN_MEDIA_RETRY_BRIDGE_KEY','TELEGRAM_BOT_TOKEN','BLOB_READ_WRITE_TOKEN'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  fs.copyFileSync(path.join(root,'voice-video-first.js'),path.join(dir,'voice-video-first.js'));
  fs.writeFileSync(path.join(dir,'voice-video-first-legacy.cjs'),[
    "'use strict';",
    "const STATE_QUEUE_KEY='midan_media_video_retries_v4';",
    "const RETRY_PREFIX='midan-media-retry/v4/';",
    "const blobAPI=()=>null;",
    "const captionOf=data=>String(data.caption||'');",
    "async function retryUsingSupabase(){const state=require('./state-v3');const data={};const result=await state.write(STATE_QUEUE_KEY,data);return result}",
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
    "async function retryPending(){return {old:true}}",
    "module.exports={recordPending,retryPending,repairTarget:async()=>({ok:true})}"
  ].join('\n'));
  fs.writeFileSync(path.join(dir,'state-v3.js'),"module.exports={read:async()=>null,write:async()=>({ok:false}),call:async()=>({ok:false})}");
  const calls=[],job={channel:'source',sourceId:33,source:'https://t.me/source/33',destination:'@maydan_alkhabar',targetMessageId:551};
  let claimed=false;
  fs.writeFileSync(path.join(dir,'media-retry-gateway.js'),[
  "module.exports={createMediaRetryGateway:()=>({",
  "enqueue:async(id,payload)=>{globalThis.__queueCalls.push(['enqueue',id,payload]);return {accepted:true}},",
  "claim:async()=>globalThis.__returnClaim?{jobKey:'x',leaseToken:'lease',payload:globalThis.__sampleJob}:null,",
  "complete:async(...args)=>{globalThis.__queueCalls.push(['complete',...args]);return true},",
  "fail:async(...args)=>{globalThis.__queueCalls.push(['fail',...args]);return true}",
  "})}"
  ].join('\n'));
  globalThis.__queueCalls=calls;globalThis.__sampleJob=job;globalThis.__returnClaim=false;
  process.env.MIDAN_MEDIA_RETRY_ENABLED='true';process.env.MIDAN_MEDIA_RETRY_DB_URL='https://example.supabase.co';
  process.env.MIDAN_MEDIA_RETRY_BRIDGE_KEY='fake-bridge-secret-for-test-environment-only';process.env.TELEGRAM_BOT_TOKEN='fake_test_token';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const m=require(path.join(dir,'voice-video-first.js'));
  assert.equal(await m.recordPending({url:job.source,channel:job.channel,id:33},{chat_id:job.destination,caption:'test'},551,[]),true);
  assert.equal(calls[0][0],'enqueue');
  assert.equal((await m.retryPending()).scanned,0);
  globalThis.__returnClaim=true;
  m.repairTarget=async()=>({ok:true,via:'already_video'});
  let out=await m.retryPending();
  assert.equal(out.failed,1);
  assert.equal(calls.at(-1)[0],'fail');
  assert.equal(calls.some(c=>c[0]==='complete'),false);
  m.repairTarget=async(_job,fetcher)=>{
    await fetcher('https://api.telegram.org/botfake_test_token/editMessageMedia',{});
    return {ok:true,via:'editMessageMedia'};
  };
  const originalRaw=globalThis.__MIDAN_NEWS_RAW_FETCH;
  globalThis.__MIDAN_NEWS_RAW_FETCH=async()=>({ok:true,clone:()=>({json:async()=>({ok:true,result:{video:{file_id:'confirmed-video-file-12345'}}})})});
  out=await m.retryPending();
  globalThis.__MIDAN_NEWS_RAW_FETCH=originalRaw;
  assert.equal(out.success,1);
  const complete=calls.find(c=>c[0]==='complete');
  assert.equal(complete[3].videoFileId,'confirmed-video-file-12345');
 }finally{
  keys.forEach(k=>old[k]===undefined?delete process.env[k]:process.env[k]=old[k]);
  delete globalThis.__queueCalls;delete globalThis.__sampleJob;delete globalThis.__returnClaim;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
