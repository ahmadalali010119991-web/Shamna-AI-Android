'use strict';
/**
 * Production-compatible voice-video-first.js retry ledger repair.
 * Original unmodified production module must be saved as
 * ./voice-video-first-legacy.cjs in the deployed package.
 * Keep all existing source-matching, media editing and retry behavior.
 */
const fs=require('node:fs'),Module=require('node:module');
const file=require.resolve('./voice-video-first-legacy.cjs');
let source=fs.readFileSync(file,'utf8');
function replaceOnce(from,to){
 if(source.split(from).length!==2)
  throw Error('MIDAN_RETRY_LEDGER_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 source=source.replace(from,to);
}
// Edge Functions accept the state/ namespace; the legacy unprefixed key is rejected.
replaceOnce("const STATE_QUEUE_KEY='midan_media_video_retries_v4';",
 "const STATE_QUEUE_KEY='state/v3-media-video-retries-v4';");
// The background worker must use the version it originally read, not issue
// another read immediately before writing.
replaceOnce("const result=await state.write(STATE_QUEUE_KEY,data);",
 "const result=await state.call('write',STATE_QUEUE_KEY,data,previous?{expected_updated_at:previous.updated_at}:{});");
const fallback=[
 "async function saveMediaRetrySupabase(record){",
 " if(process.env.MIDAN_MEDIA_RETRY_ENABLED==='true'){",
 "  try{",
 "   const g=require('./media-retry-gateway').createMediaRetryGateway({projectUrl:process.env.MIDAN_MEDIA_RETRY_DB_URL,bridgeKey:process.env.MIDAN_MEDIA_RETRY_BRIDGE_KEY});",
 "   const saved=await g.enqueue({channel:record.channel,sourceId:record.sourceId,targetMessageId:record.targetMessageId},record);",
 "   return saved?.accepted===true;",
 "  }catch(e){console.error('Midan media queue enqueue failed',String(e.message||e).slice(0,120));return false}",
 " }",
 " const state=require('./state-v3'),key=STATE_QUEUE_KEY;",
 " const id=record.channel+':'+record.sourceId+':'+record.targetMessageId;",
 " for(let retry=0;retry<5;retry++){",
 "  try{",
 "   const previous=await state.read(key);",
 "   const raw=previous?.value;",
 "   const data=raw&&raw.schema===4&&raw.jobs&&typeof raw.jobs==='object'&&!Array.isArray(raw.jobs)",
 "    ?{...raw,jobs:{...raw.jobs}}",
 "    :{schema:4,jobs:{},done552:false,createdAt:new Date().toISOString()};",
 "   if(data.jobs[id]||(record.channel==='suhebb0'&&record.targetMessageId===552&&data.done552))return true;",
 "   if(Object.keys(data.jobs).length>=250){",
 "    console.error('Midan media queue full; preserving original message');",
 "    return false;",
 "   }",
 "   data.jobs[id]=record;",
 "   data.updatedAt=new Date().toISOString();",
 "   const saved=await state.call('write',key,data,previous?{expected_updated_at:previous.updated_at}:{});",
 "   if(!saved||saved.ok!==true)continue;",
 "   const checked=await state.read(key);",
 "   if(checked?.value?.jobs?.[id]||",
 "      checked?.value?.lastSuccess?.target===record.targetMessageId||",
 "      (record.channel==='suhebb0'&&record.targetMessageId===552&&checked?.value?.done552))",
 "    return true;",
 "  }catch(e){",
 "   if(retry===4)console.warn('Midan Supabase media queue unavailable:',String(e.message||e).slice(0,130));",
 "  }",
 " }",
 " return false;",
 "}"
].join('\n');
replaceOnce('async function recordPending(src,data,targetMessageId,reasons,extra={}){',
 fallback+'\nasync function recordPending(src,data,targetMessageId,reasons,extra={}){');
replaceOnce('if(!process.env.BLOB_READ_WRITE_TOKEN||!targetMessageId)return false;',
 'if(!targetMessageId)return false;');
replaceOnce('const blob=blobAPI();if(!blob)return false;',
 'const blob=blobAPI();');
replaceOnce("try{\n  await blob.put(RETRY_PREFIX+src.channel",
 "try{\n  if(process.env.MIDAN_MEDIA_RETRY_ENABLED==='true'||!blob||!process.env.BLOB_READ_WRITE_TOKEN)throw Error('BLOB_UNAVAILABLE');\n  await blob.put(RETRY_PREFIX+src.channel");
replaceOnce("}catch(e){console.warn('Midan media retry ledger unavailable:',String(e.message||e).slice(0,100));return false}",
 "}catch(e){console.warn('Midan Blob retry unavailable; using Supabase:',String(e.message||e).slice(0,100));return saveMediaRetrySupabase(record)}");
const child=new Module(file,module);
child.filename=file;child.paths=module.paths;
child._compile(source,file);
module.exports=child.exports;

const legacyRetryPending=module.exports.retryPending;
module.exports.retryPending=async function(...args){
 if(process.env.MIDAN_MEDIA_RETRY_ENABLED!=='true')return legacyRetryPending(...args);
 const backend='midan-postgres-retry-queue';
 const botToken=process.env.TELEGRAM_BOT_TOKEN;
 if(!botToken)return {backend,skipped:'bot_token_missing',failed:1};
 let gateway,claim;
 try{
  const {createMediaRetryGateway}=require('./media-retry-gateway');
  gateway=createMediaRetryGateway({projectUrl:process.env.MIDAN_MEDIA_RETRY_DB_URL,bridgeKey:process.env.MIDAN_MEDIA_RETRY_BRIDGE_KEY});
  claim=await gateway.claim(600);
 }catch(e){console.error('Midan retry claim error',String(e?.message||e).slice(0,120));return {backend,skipped:'claim_failed',failed:1};}
 if(!claim)return {backend,scanned:0,success:0,failed:0};
 const received=new Set();
 const native=args[0]||globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch;
 const observed=async function(input,init){
  const res=await native(input,init);
  try{
   const url=String(typeof input==='string'?input:input?.url||'');
   if(url.startsWith('https://api.telegram.org/bot')&&url.includes('/editMessageMedia')&&res?.ok){
    const result=await res.clone().json();
    const fileId=result?.result?.video?.file_id;
    if(typeof fileId==='string'&&fileId.trim().length>=8)received.add(fileId);
   }
  }catch{}
  return res;
 };
 try{
  const job=claim.payload;
  if(!job||typeof job!=='object'||!Number.isSafeInteger(Number(job.targetMessageId)))
   throw Error('INVALID_CLAIMED_JOB');
  const repaired=await module.exports.repairTarget(job,observed,'https://api.telegram.org/bot'+botToken+'/sendMessage');
  const videoFileId=Array.from(received)[0];
  if(!repaired?.ok||!videoFileId)throw Error('VIDEO_RECEIPT_UNCONFIRMED');
  const completed=await gateway.complete(claim.jobKey,claim.leaseToken,{
    messageId:Number(job.targetMessageId),videoFileId});
  if(completed!==true)throw Error('RETRY_COMPLETION_REJECTED');
  return {backend,scanned:1,success:1,failed:0,targetMessageId:job.targetMessageId,via:repaired.via};
 }catch(e){
  const reason=String(e?.message||e).slice(0,150);
  try{await gateway.fail(claim.jobKey,claim.leaseToken,reason)}catch(err){console.error('Midan retry failure persistence',String(err?.message||err).slice(0,100))}
  return {backend,scanned:1,success:0,failed:1,reason};
 }
};
