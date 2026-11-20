'use strict';
const assert=require('node:assert/strict');
const {createEnvelope}=require('./signed-handoff.cjs');
const {createMediaHandoffHandler}=require('./handoff-http-handler.cjs');
const secret='test-very-long-server-only-cross-app-signing-secret';
const seen=new Set(),jobs=new Map();
const consumeNonce=async nonce=>{if(seen.has(nonce))return false;seen.add(nonce);return true;};
const enqueue=async ({key})=>{let already=jobs.has(key);if(!already)jobs.set(key,'job-'+jobs.size);return {accepted:true,jobId:jobs.get(key),alreadyExists:already}};
let now=1794570000000;
const handler=createMediaHandoffHandler({secret,consumeNonce,enqueue,clock:()=>now});
function req(envelope,extra={}){return {method:'POST',rawBody:envelope.body,headers:{...envelope.headers,...extra}}}
async function send(r){
 let result,headers={};
 await handler(r,{setHeader:(k,v)=>{headers[k]=v;},status(s){result={status:s};return this;},json(x){result.body=x;return result}});
 return {result,headers};
}
const story={id:'midan-news-123',title:'Example',mediaKind:'video',sourceUrl:'https://example.org/news/123'};
(async()=>{
 let a=createEnvelope(story,{secret,clock:now,nonce:'UNIQUE_NONCE_00000001'});
 let first=await send(req(a));assert.equal(first.result.status,202);assert.equal(first.result.body.queued,true);
 assert.equal((await send(req(a))).result.status,409);
 let b=createEnvelope(story,{secret,clock:now,nonce:'UNIQUE_NONCE_00000002'});
 let duplicate=await send(req(b));assert.equal(duplicate.result.status,200);
 assert.equal(duplicate.result.body.alreadyExists,true);assert.equal(jobs.size,1);
 assert.equal((await send({...req(b),method:'GET'})).result.status,405);
 assert.equal((await send(req(b,{'content-type':'text/plain'}))).result.status,415);
 assert.equal((await send({...req(b),rawBody:undefined})).result.status,400);
 assert.equal((await send({...req(b),rawBody:b.body+' '})).result.status,401);
 let c=createEnvelope(story,{secret,clock:now-600000,nonce:'UNIQUE_NONCE_00000003'});
 assert.equal((await send(req(c))).result.status,401);
 const unavailable=createMediaHandoffHandler({secret,consumeNonce:async()=>true,enqueue:async()=>{throw Error('storage down')},clock:()=>now});
 let r;
 await unavailable(req(createEnvelope(story,{secret,clock:now,nonce:'UNIQUE_NONCE_00000004'})),{setHeader(){},status(s){r={status:s};return this},json(o){r.body=o;return r}});
 assert.equal(r.status,503);assert.equal(r.body.retryWithNewNonce,true);
 console.log('PASS: authenticated queue ingress, duplicate, replay, tamper and storage failure');
})().catch(e=>{console.error(e);process.exitCode=1});
