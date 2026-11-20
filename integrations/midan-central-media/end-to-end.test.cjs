'use strict';
/**
 * Full source -> signed ingress -> durable queue -> media recovery -> two destination
 * simulated integration regression. Mocks DO NOT imply real publication.
 */
const assert=require('node:assert/strict');
const {createEnvelope}=require('./signed-handoff.cjs');
const {createMediaHandoffHandler}=require('./handoff-http-handler.cjs');
const {handoff}=require('./handoff-engine.cjs');
const secret='midan-integration-test-secret-which-never-leaves-server';
const time=1794570000000;
const durableQueue=new Map(), nonces=new Set(), states=new Map(),sent=new Map();
const consumeNonce=async nonce=>!nonces.has(nonce)&&(nonces.add(nonce),true);
const enqueue=async ({key,article})=>{
 if(durableQueue.has(key)&&JSON.stringify(durableQueue.get(key))!==JSON.stringify(article))
  throw Error('ARTICLE_CONFLICT');
 const duplicate=durableQueue.has(key);
 durableQueue.set(key,article);
 return {accepted:true,alreadyExists:duplicate,jobId:key};
};
const ingress=createMediaHandoffHandler({secret,consumeNonce,enqueue,clock:()=>time});
function mockResponse(){
 const response={code:0,body:null};
 return {response,res:{setHeader(){return this},status(code){response.code=code;return this},json(body){response.body=body;return this}}};
}
async function push(raw,nonce){
 const packet=createEnvelope(raw,{secret,clock:time,nonce});
 const {response,res}=mockResponse();
 await ingress({method:'POST',headers:packet.headers,rawBody:packet.body},res);
 return response;
}
const store={
 async transaction(key,cb){
  const current=structuredClone(states.get(key)||{});
  return cb(current,async next=>states.set(key,structuredClone(next)),async()=>{});
 }
};
let telegramOffline=true;
const website={publish:async (story,media,{idempotencyKey})=>{
 if(sent.has(idempotencyKey))return {ok:true,externalId:sent.get(idempotencyKey)};
 const ref='site-'+(sent.size+1);sent.set(idempotencyKey,ref);return {ok:true,externalId:ref};
}};
const telegram={publish:async (story,media,{idempotencyKey})=>{
 if(telegramOffline)throw Error('TELEGRAM_OFFLINE');
 if(sent.has(idempotencyKey))return {ok:true,externalId:sent.get(idempotencyKey)};
 const ref='tg-'+(sent.size+1);sent.set(idempotencyKey,ref);return {ok:true,externalId:ref};
}};
const validate=async media=>media.kind==='text'||(typeof media.uri==='string'&&media.uri.startsWith('https://'));
(async()=>{
 const video={id:'video-case',title:'Video story',mediaKind:'video',
   sourceUrl:'https://example.org/story-video',media:[{kind:'photo',isOriginal:true,uri:'https://example.org/preview.jpg'}]};
 const accepted=await push(video,'INTEGRATION_NONCE_00000001');
 assert.equal(accepted.code,202);
 assert.equal((await push(video,'INTEGRATION_NONCE_00000002')).code,200);
 assert.equal(durableQueue.size,1);
 const fromQueue=durableQueue.get(accepted.body.key);
 const recovery=[{id:'publisher-mp4',run:async()=>({kind:'video',uri:'https://example.org/video.mp4'})}];
 const first=await handoff(fromQueue,{store,recover:recovery,website,telegram,validate});
 assert.equal(first.stage,'partially-published');
 assert.equal(first.mediaKind,'video');
 assert.equal(sent.size,1);
 telegramOffline=false;
 const second=await handoff(fromQueue,{store,recover:recovery,website,telegram,validate});
 assert.equal(second.stage,'complete');
 assert.equal(sent.size,2);
 const third=await handoff(fromQueue,{store,recover:recovery,website,telegram,validate});
 assert.equal(third.stage,'complete');
 assert.equal(sent.size,2);
 const photo={id:'photo-case',title:'Photo story',mediaKind:'photo',sourceUrl:'https://example.org/story-photo'};
 const photoReq=await push(photo,'INTEGRATION_NONCE_00000003');
 assert.equal(photoReq.code,202);
 const publishedPhoto=await handoff(durableQueue.get(photoReq.body.key),{
  store,recover:[{id:'original-photo',run:async()=>({kind:'photo',uri:'https://example.org/image.jpg'})}],
  website,telegram,validate
 });
 assert.equal(publishedPhoto.stage,'complete');
 assert.equal(publishedPhoto.mediaKind,'photo');
 const text={id:'text-case',title:'Text story',mediaKind:'text',sourceUrl:'https://example.org/story-text'};
 const textReq=await push(text,'INTEGRATION_NONCE_00000004');
 const textResult=await handoff(durableQueue.get(textReq.body.key),{store,website,telegram,validate});
 assert.equal(textResult.stage,'complete');
 assert.equal(textResult.mediaKind,'text');
 assert.equal(durableQueue.size,3);
 assert.equal(sent.size,6);
 console.log('PASS: signed ingress -> queue -> video/photo/text -> website & Telegram simulated publication, outage recovery, no duplicate');
})().catch(e=>{console.error(e);process.exitCode=1});
