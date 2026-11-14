'use strict';
const assert=require('node:assert/strict');
const {createEnvelope,verifyEnvelope}=require('./signed-handoff.cjs');
const secret='long-and-unique-backend-only-secret-for-tests';
const sent=createEnvelope({id:'story-10',title:'News',sourceUrl:'https://example.com/story/10',mediaKind:'photo'},
 {secret,clock:1794570000000,nonce:'NONCE_____TEST__0001'});
const used=new Set();
const consumeNonce=async n=>{if(used.has(n))return false;used.add(n);return true};
(async()=>{
 const o={rawBody:sent.body,headers:sent.headers,secret,consumeNonce,now:1794570000000};
 const result=await verifyEnvelope(o);
 assert.equal(result.article.mediaKind,'photo');
 await assert.rejects(()=>verifyEnvelope(o),/REPLAY/);
 await assert.rejects(()=>verifyEnvelope({...o,now:1794570500000}),/EXPIRED/);
 await assert.rejects(()=>verifyEnvelope({...o,rawBody:sent.body+' '}),/INVALID/);
 await assert.rejects(()=>verifyEnvelope({...o,consumeNonce:undefined}),/PERSISTENT_NONCE/);
 assert.throws(()=>createEnvelope({id:'x',title:'N',sourceUrl:'https://example.com'}, {secret:'short'}),/SECRET_TOO_SHORT/);
 console.log('PASS: signed handoff tamper, expiry, replay, persistent nonce checks');
})().catch(e=>{console.error(e);process.exitCode=1});
