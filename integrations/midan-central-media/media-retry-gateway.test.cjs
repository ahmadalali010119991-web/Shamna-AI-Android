'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createMediaRetryGateway}=require('./media-retry-gateway.cjs');
const id={channel:'suhebb0',sourceId:47990,targetMessageId:552};
function make(){
 const state={jobs:new Map(),calls:[],counter:0};
 const fetcher=async(url,opts)=>{
  const {op,params}=JSON.parse(opts.body);state.calls.push({op,params});
  let value;
  const j=state.jobs.get(params.p_key);
  if(op==='ping')value={storage:'available'};
  if(op==='enqueue'){
   if(j)value={accepted:true,alreadyExists:true};
   else{state.jobs.set(params.p_key,{payload:params.p_payload,state:'pending'});value={accepted:true,alreadyExists:false};}
  }
  if(op==='claim'){
   const entry=Array.from(state.jobs).find(([,x])=>x.state==='pending');
   if(entry){entry[1].state='leased';entry[1].token='lease-'+(++state.counter);value={
    jobKey:entry[0],leaseToken:entry[1].token,payload:entry[1].payload};}
   else value=null;
  }
  if(op==='renew')value=j?.state==='leased'&&j.token===params.p_token;
  if(op==='complete'){
   value=!!j&&j.state==='leased'&&j.token===params.p_token;
   if(value){j.state='completed';j.payload={};j.file=params.p_telegram_file_id;}
  }
  if(op==='fail')value=!!j&&j.state==='leased'&&j.token===params.p_token;
  return {ok:true,status:200,json:async()=>({ok:true,result:value})};
 };
 return {state,queue:createMediaRetryGateway({projectUrl:'https://exampleproject.supabase.co',bridgeKey:'fake-test-secret-value-12345678901234567890',fetcher})};
}
test('private gateway accepts concurrent duplicate enqueue once',async()=>{
 const {queue,state}=make();
 const r=await Promise.all([queue.enqueue(id,{source:'a'}),queue.enqueue(id,{source:'a'})]);
 assert.equal(r.filter(x=>x.alreadyExists).length,1);
 assert.equal(state.jobs.size,1);
 const claims=await Promise.all([queue.claim(),queue.claim()]);
 assert.equal(claims.filter(Boolean).length,1);
 const c=claims.find(Boolean);
 assert.equal(await queue.complete(c.jobKey,'wrong',{messageId:552,videoFileId:'file_verified_123456'}),false);
 assert.equal(await queue.complete(c.jobKey,c.leaseToken,{messageId:552,videoFileId:'file_verified_123456'}),true);
 assert.equal(state.jobs.get(c.jobKey).state,'completed');
 assert.deepEqual(state.jobs.get(c.jobKey).payload,{});
});
test('no unconfirmed native video accepted',async()=>{
 const {queue,state}=make();
 await assert.rejects(()=>queue.complete('x','y',{messageId:11}),/CONFIRMED_TELEGRAM_NATIVE_VIDEO_REQUIRED/);
 await assert.rejects(()=>queue.enqueue(id,{payload:'z'.repeat(30000)}),/INVALID_JOB_PAYLOAD/);
 assert.equal(state.calls.length,0);
});
test('secret stays server-side and not in thrown errors',async()=>{
 const secret='fake-test-secret-value-12345678901234567890';
 const queue=createMediaRetryGateway({projectUrl:'https://exampleproject.supabase.co',bridgeKey:secret,
 fetcher:async()=>({ok:false,status:403})});
 await assert.rejects(()=>queue.ping(),e=>e.message==='RETRY_GATEWAY_HTTP_403'&&!e.message.includes(secret));
});
