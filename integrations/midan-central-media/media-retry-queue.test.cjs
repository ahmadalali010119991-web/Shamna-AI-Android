'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createMediaRetryQueue}=require('./media-retry-queue.cjs');
function fixture(){
 const jobs=new Map(),calls=[];let sequence=0;
 const fetcher=async(url,options)=>{
  const op=url.split('/').pop(),input=JSON.parse(options.body);calls.push({op,input});
  const output=(()=>{
   if(op==='midan_retry_enqueue'){
    let job=jobs.get(input.p_key);
    if(job)return {accepted:true,alreadyExists:true,state:job.state};
    jobs.set(input.p_key,{state:'pending',payload:input.p_payload,attempts:0});
    return {accepted:true,alreadyExists:false,state:'pending'};
   }
   if(op==='midan_retry_claim'){
    for(const [key,job] of jobs){
     if(job.state!=='pending')continue;
     job.state='leased';job.attempts++;job.token='token-'+(++sequence);
     return {jobKey:key,payload:job.payload,leaseToken:job.token,attempts:job.attempts};
    }
    return null;
   }
   const job=jobs.get(input.p_key);
   if(op==='midan_retry_renew')return job?.state==='leased'&&job.token===input.p_token;
   if(op==='midan_retry_complete'){
    if(job?.state!=='leased'||job.token!==input.p_token)return false;
    job.state='completed';job.payload={};job.messageId=input.p_telegram_message_id;return true;
   }
   if(op==='midan_retry_fail'){
    if(job?.state!=='leased'||job.token!==input.p_token)return false;
    job.state=job.attempts>=8?'dead':'pending';return true;
   }
   throw Error('UNEXPECTED_RPC_'+op);
  })();
  return {ok:true,json:async()=>output};
 };
 return {jobs,calls,queue:createMediaRetryQueue({
  url:'https://exampleproject.supabase.co',serviceRoleKey:'example-server-key-not-real',fetcher})};
}
test('idempotent insertion and exclusive claim',async()=>{
 const {queue,jobs}=fixture();
 const id={channel:'suhebb0',sourceId:47990,targetMessageId:552};
 const results=await Promise.all([
  queue.enqueue(id,{media:'video'}),queue.enqueue(id,{media:'video'})
 ]);
 assert.equal(results.filter(x=>x.alreadyExists).length,1);
 const claims=await Promise.all([queue.claim(),queue.claim()]);
 assert.equal(claims.filter(Boolean).length,1);
 const job=claims.find(Boolean);
 assert.equal(await queue.complete(job.jobKey,'wrong',{messageId:552,fileId:'valid-file-552'}),false);
 assert.equal(await queue.renew(job.jobKey,job.leaseToken),true);
 assert.equal(await queue.complete(job.jobKey,job.leaseToken,{messageId:552,fileId:'verified'}),true);
 assert.equal(jobs.get(job.jobKey).state,'completed');
 assert.deepEqual(jobs.get(job.jobKey).payload,{});
 assert.equal(await queue.claim(),null);
});
test('failed attempt retries; stale token cannot complete',async()=>{
 const {queue}=fixture();
 await queue.enqueue({channel:'suhebb0',sourceId:123,targetMessageId:500},{});
 const first=await queue.claim();
 assert.equal(await queue.fail(first.jobKey,first.leaseToken,new Error('network')),true);
 const second=await queue.claim();
 assert.notEqual(second.leaseToken,first.leaseToken);
 assert.equal(await queue.complete(first.jobKey,first.leaseToken,{messageId:500,fileId:'valid-file-500'}),false);
 assert.equal(await queue.complete(second.jobKey,second.leaseToken,{messageId:500,fileId:'valid-file-500'}),true);
});
test('invalid identifiers, big payload, unconfirmed receipt rejected',async()=>{
 const {queue,calls}=fixture();
 assert.throws(()=>queue.keyFor({channel:'',sourceId:1,targetMessageId:1}),/INVALID_RETRY_ID/);
 await assert.rejects(()=>queue.complete('x','t',{}),/CONFIRMED_TELEGRAM_MESSAGE_ID_REQUIRED/);
 await assert.rejects(()=>queue.complete('x','t',{messageId:123}),/CONFIRMED_TELEGRAM_VIDEO_FILE_ID_REQUIRED/);
 await assert.rejects(()=>queue.enqueue({channel:'source',sourceId:1,targetMessageId:1},
 {blob:'x'.repeat(25000)}),/RETRY_PAYLOAD_TOO_LARGE/);
 assert.equal(calls.length,0);
});
test('transport errors do not disclose key',async()=>{
 const secret='private-key-never-print';
 const queue=createMediaRetryQueue({url:'https://exampleproject.supabase.co',serviceRoleKey:secret,
  fetcher:async()=>({ok:false,status:503})});
 await assert.rejects(()=>queue.claim(),e=>e.message==='RETRY_RPC_midan_retry_claim_HTTP_503'&&!e.message.includes(secret));
});
