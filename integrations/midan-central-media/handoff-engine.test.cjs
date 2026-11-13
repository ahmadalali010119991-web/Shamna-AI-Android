'use strict';
const assert=require('node:assert/strict');
const {handoff}=require('./handoff-engine.cjs');
const base={id:'voice-suhaib-47987',title:'News',sourceUrl:'https://t.me/suhebb0/47987',mediaKind:'video',media:[{kind:'photo',isOriginal:true,uri:'https://t.me/a.jpg'}]};
function durable(){
 const slots=new Map();
 return {slots,transaction:async(k,fn)=>fn(slots.get(k),async state=>slots.set(k,structuredClone(state)))};
}
const v=async m=>!!m.uri;
(async()=>{
 const store=durable(),calls=[];
 let telegramOffline=true;
 const website={publish:async()=>{calls.push('web');return {ok:true,externalId:'site-11'}}};
 const telegram={publish:async()=>{calls.push('telegram');if(telegramOffline)throw Error('offline');return {ok:true,externalId:'tg-11'}}};
 const route={id:'web-video',run:async()=>({kind:'video',uri:'https://example.com/v.mp4'})};
 const ctx={store,recover:[route],website,telegram,validate:v};
 const first=await handoff(base,ctx);
 assert.equal(first.stage,'partially-published');
 telegramOffline=false;
 const second=await handoff(base,{...ctx,recover:[{id:'web-video',run:async()=>{throw Error('media should already exist')}}]});
 assert.equal(second.stage,'complete');
 assert.equal(calls.filter(x=>x==='web').length,1,'successful website must not repost');
 assert.equal(calls.filter(x=>x==='telegram').length,2,'only failed destination retries');
 const waiting=await handoff({...base,id:'case-empty-media'},{
  store:durable(),recover:[{id:'temporary-empty',run:async()=>null}],
  website,telegram,validate:v
 });
 assert.equal(waiting.stage,'awaiting-media','null response is not permanently exhausted');
 assert.equal(waiting.attempts['temporary-empty'].status,'retry');
 const fallback=await handoff({...base,id:'case-exhausted'},{
  store:durable(),recover:[{id:'permanent',run:async()=>{const err=Error('gone');err.permanent=true;throw err}}],
  website,telegram,validate:v
 });
 assert.equal(fallback.mediaKind,'photo','verified original photo fallback after explicit permanent failure');
 const partial=await handoff({...base,id:'case-mixed'},{
  store:durable(),recover:[
   {id:'gone',run:async()=>{const err=Error('gone');err.permanent=true;throw err}},
   {id:'slow',run:async()=>null}
  ],website,telegram,validate:v
 });
 assert.equal(partial.stage,'awaiting-media','pending route blocks premature fallback');
 const noOrigin=await handoff({...base,id:'case-no-original',media:[]},{
  store:durable(),recover:[{id:'gone',run:async()=>{const err=Error('gone');err.permanent=true;throw err}}],
  website,telegram,validate:v
 });
 assert.equal(noOrigin.stage,'awaiting-media','no fabricated replacement image');
 await assert.rejects(()=>handoff({...base,id:'duplicate'},{
  store:durable(),recover:[{id:'same',run:async()=>null},{id:'same',run:async()=>null}],website,telegram,validate:v
 }),/DUPLICATE/);
 await assert.rejects(()=>handoff({...base,id:'no-routes'},{
  store:durable(),recover:[],website,telegram,validate:v
 }),/NO_MEDIA_RECOVERY_ADAPTERS/);
 const textOnly=await handoff({id:'text-only',title:'News',sourceUrl:'https://example.com/story',mediaKind:'text'},{
  store:durable(),website,telegram,validate:v
 });
 assert.equal(textOnly.stage,'complete','text-only stories do not need media recovery');
 console.log('PASS: 10 central handoff regression assertions');
})().catch(e=>{console.error(e);process.exitCode=1});
