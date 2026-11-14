'use strict';
const assert=require('node:assert/strict');
const {createSupabaseLeaseStore}=require('./supabase-lease-store.cjs');
const jobs=new Map();
const key='a'.repeat(64);
let tokenNo=0;
let failures=new Set();
const fetcher=async(url,opts)=>{
 const name=url.split('/').at(-1);
 if(failures.has(name))return {ok:false,status:503};
 const body=JSON.parse(opts.body);
 let item=jobs.get(body.p_key);
 let result;
 if(name==='midan_media_claim'){
  if(!item){item={state:{},token:null};jobs.set(body.p_key,item);}
  if(item.token)result=null;
  else{item.token='lease-'+(++tokenNo);result={token:item.token,state:item.state};}
 }else if(name==='midan_media_renew'){
  result=!!item&&item.token===body.p_token;
 }else if(name==='midan_media_save'){
  result=!!item&&item.token===body.p_token;
  if(result)item.state=body.p_state;
 }else if(name==='midan_media_release'){
  result=!!item&&item.token===body.p_token;
  if(result)item.token=null;
 }else throw Error('unexpected RPC '+name);
 return {ok:true,json:async()=>result};
};
(async()=>{
 const store=createSupabaseLeaseStore({url:'https://example.supabase.co',serviceRoleKey:'test-key',fetcher});
 let concurrent;
 const first=await store.transaction(key,async(state,save,renew)=>{
  await renew();
  await save({website:'sent'});
  await assert.rejects(()=>store.transaction(key,async()=>{}),/LEASE_BUSY/);
  concurrent=true;
  return 'done';
 });
 assert.equal(first,'done');assert.equal(concurrent,true);
 const second=await store.transaction(key,async(state,save)=>{
  assert.equal(state.website,'sent');await save({...state,telegram:'sent'});
  return state;
 });
 assert.equal(second.website,'sent');
 assert.equal(jobs.get(key).state.telegram,'sent');
 failures.add('midan_media_save');
 await assert.rejects(()=>store.transaction(key,async(_,save)=>save({bad:true})),/HTTP_503/);
 failures.clear();
 assert.equal(jobs.get(key).token,null,'finally releases after failure');
 await assert.rejects(()=>store.transaction('wrong',async()=>{}),/INVALID_ARTICLE_KEY/);
 assert.throws(()=>createSupabaseLeaseStore({url:'http://bad',serviceRoleKey:'k',fetcher}),/URL_REQUIRED/);
 assert.throws(()=>createSupabaseLeaseStore({url:'https://example.supabase.co',serviceRoleKey:'k',fetcher,leaseSeconds:1}),/INVALID_LEASE_SECONDS/);
 console.log('PASS: durable store claim/save/recovery/concurrency/error validation');
})().catch(e=>{console.error(e);process.exitCode=1});
