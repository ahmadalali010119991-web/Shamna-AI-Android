'use strict';
const assert=require('node:assert/strict');
const {createTelegramPublisher,safeMediaRef}=require('./telegram-bot-publisher.cjs');
const seen=new Map(),sent=[];
const ledger={
 reserve:async key=>{
  const state=seen.get(key);
  if(!state){seen.set(key,{status:'in_flight'});return {status:'claimed'};}
  return state;
 },
 markSent:async(key,id)=>seen.set(key,{status:'sent',externalId:id}),
 markUncertain:async(key,reason)=>seen.set(key,{status:'uncertain',reason})
};
const source='https://example.org/article';
const story={id:'voice-test',title:'اختبار <فيديو> & مصدر',sourceUrl:source};
let sequence=0;
const fetcher=async (url,opts)=>{
 const method=url.split('/').at(-1);
 const payload=JSON.parse(opts.body);
 sent.push({method,payload});
 if(++sequence===3)throw Error('connection lost');
 return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:300+sequence}})};
};
const bot=createTelegramPublisher({botToken:'test-secret-only',chatId:'@maydan_alkhabar',ledger,fetcher});
(async()=>{
 await assert.rejects(()=>bot.publish(story,{kind:'video',uri:'https://cdn.example.org/a.mp4'}, {idempotencyKey:'bad'}),/MEDIA_NOT_VERIFIED/);
 const video={kind:'video',verified:true,fileId:'BAACAgQAAxkBAAIBb2StableMediaId'};
 let a=await bot.publish(story,video,{idempotencyKey:'article-video:telegram'});
 assert.equal(a.externalId,'301');assert.equal(sent[0].method,'sendVideo');
 assert.equal(sent[0].payload.video,video.fileId);
 assert.ok(sent[0].payload.caption.includes('&lt;فيديو&gt;'));
 assert.ok(sent[0].payload.caption.includes('المصدر الأصلي'));
 let dup=await bot.publish(story,video,{idempotencyKey:'article-video:telegram'});
 assert.equal(dup.deduplicated,true);assert.equal(sent.length,1);
 const photo=await bot.publish(story,{kind:'photo',verified:true,uri:'https://cdn.example.org/a.jpg'},
  {idempotencyKey:'article-photo:telegram'});
 assert.equal(photo.externalId,'302');assert.equal(sent[1].method,'sendPhoto');
 await assert.rejects(()=>bot.publish(story,{kind:'text'}, {idempotencyKey:'article-text:telegram'}),/connection lost/);
 assert.equal(seen.get('article-text:telegram').status,'uncertain');
 await assert.rejects(()=>bot.publish(story,{kind:'text'}, {idempotencyKey:'article-text:telegram'}),/NOT_RECONCILED/);
 assert.equal(sent.length,3,'ambiguous sending must never create another message');
 assert.throws(()=>safeMediaRef('http://localhost/x.mp4'),/UNTRUSTED/);
 assert.throws(()=>safeMediaRef('https://127.0.0.1/a.mp4'),/UNTRUSTED/);
 assert.throws(()=>safeMediaRef('file:///etc/passwd'),/UNTRUSTED/);
 assert.throws(()=>createTelegramPublisher({botToken:'t',chatId:'c'}),/LEDGER_REQUIRED/);
 console.log('PASS: real Bot API adapter request structure, confirmed delivery, idempotence and timeout freeze');
})().catch(e=>{console.error(e);process.exitCode=1});
