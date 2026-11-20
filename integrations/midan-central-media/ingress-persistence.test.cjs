'use strict';
const assert=require('node:assert/strict');
const {createIngressPersistence}=require('./ingress-persistence.cjs');
const nonces=new Set(),events=new Map();
const fetcher=async (url,opts)=>{
 const {p_nonce,p_key,p_event}=JSON.parse(opts.body);
 let out;
 if(url.endsWith('midan_media_consume_nonce')){
  out=!nonces.has(p_nonce);nonces.add(p_nonce);
 }else if(url.endsWith('midan_media_enqueue')){
  if(events.has(p_key)&&JSON.stringify(events.get(p_key))!==JSON.stringify(p_event))return {ok:false,status:409};
  out={accepted:true,jobId:p_key,alreadyExists:events.has(p_key)};
  events.set(p_key,p_event);
 }else throw Error('UNKNOWN_RPC');
 return {ok:true,json:async()=>out};
};
(async()=>{
 const p=createIngressPersistence({url:'https://mock.supabase.co',serviceRoleKey:'server-only-test',fetcher});
 assert.equal(await p.consumeNonce('UNIQUE_NONCE_00000001'),true);
 assert.equal(await p.consumeNonce('UNIQUE_NONCE_00000001'),false);
 const first=await p.enqueue({key:'a'.repeat(64),article:{title:'original'}});
 assert.equal(first.alreadyExists,false);
 const second=await p.enqueue({key:'a'.repeat(64),article:{title:'original'}});
 assert.equal(second.alreadyExists,true);
 await assert.rejects(()=>p.enqueue({key:'a'.repeat(64),article:{title:'tampered'}}),/409/);
 assert.throws(()=>createIngressPersistence({url:'http://bad',serviceRoleKey:'k'}),/CONFIG/);
 console.log('PASS: ingress nonce and queue storage RPC contracts');
})().catch(e=>{console.error(e);process.exitCode=1});
