'use strict';
/**
 * Whole-chain regression: source candidate -> verified downloaded object ->
 * durable public URL -> anonymous playback proof -> independently idempotent
 * website and Telegram delivery. No real channel messages are sent.
 */
const assert=require('node:assert/strict');
const {handoff}=require('./handoff-engine.cjs');
const {createSourceVideoRecovery}=require('./source-video-recovery.cjs');
const article={id:'verified-video-case',title:'Video report',mediaKind:'video',
 sourceUrl:'https://publisher.example.org/article/123',media:[]};
const delivered=[],states=new Map();let telegramOffline=true,downloads=0,playbackAllowed=true;
const uri='https://media.public.example.org/sha256-video.mp4';
const recovery=createSourceVideoRecovery({
 discovery:{discover:async()=>[{kind:'video',uri:'https://publisher.example.org/stream.mp4'}]},
 downloader:{download:async()=>{downloads++;return {kind:'video',verified:true,
  uri:'https://publisher.example.org/stream.mp4',contentType:'video/mp4',
  size:128,sha256:'a'.repeat(64),bytes:new Uint8Array(128)}}},
 store:{persist:async v=>({kind:'video',verified:true,uri,size:v.size,
  contentType:v.contentType,sha256:v.sha256})},
 playback:{check:async v=>{
  if(!playbackAllowed)throw Error('PUBLIC_VIDEO_HEAD_FAILED');
  return {...v,publiclyPlayable:true};
 }},
 canReuse:async()=>true
});
const store={transaction:async(key,work)=>{
 let state=structuredClone(states.get(key)||{});
 const save=async current=>states.set(key,structuredClone(current));
 return work(state,save,async()=>{});
}};
const website={publish:async(_story,media,{idempotencyKey})=>{
 assert.equal(media.uri,uri);assert.equal(media.publiclyPlayable,true);
 delivered.push({target:'website',key:idempotencyKey,uri:media.uri});
 return {ok:true,externalId:'site-post-123'};
}};
const telegram={publish:async(_story,media,{idempotencyKey})=>{
 assert.equal(media.uri,uri);assert.equal(media.publiclyPlayable,true);
 delivered.push({target:'telegram',key:idempotencyKey,uri:media.uri});
 if(telegramOffline)throw Error('TELEGRAM_UNAVAILABLE');
 return {ok:true,externalId:'telegram-message-123'};
}};
(async()=>{
 const ctx={store,recover:[recovery],website,telegram,validate:async media=>
  media.kind==='video'&&media.verified===true&&media.publiclyPlayable===true};
 let first=await handoff(article,ctx);
 assert.equal(first.stage,'partially-published');
 assert.equal(downloads,1);
 telegramOffline=false;
 let second=await handoff(article,ctx);
 assert.equal(second.stage,'complete');
 assert.equal(downloads,1,'same media must not be downloaded again');
 assert.equal(delivered.filter(x=>x.target==='website').length,1);
 assert.equal(delivered.filter(x=>x.target==='telegram').length,2);
 assert.equal(delivered[0].uri,delivered[2].uri);
 const third=await handoff(article,ctx);
 assert.equal(third.stage,'complete');
 assert.equal(delivered.length,3,'complete posts must not publish again');
 playbackAllowed=false;
 const blocked={...article,id:'video-blocked-unplayable'};
 const before=delivered.length;
 const waiting=await handoff(blocked,ctx);
 assert.equal(waiting.stage,'awaiting-media');
 assert.equal(delivered.length,before);
 console.log('PASS: verified playable video flows to both destinations, resumes Telegram outage, no duplicates, blocks unplayable file');
})().catch(e=>{console.error(e);process.exitCode=1});
