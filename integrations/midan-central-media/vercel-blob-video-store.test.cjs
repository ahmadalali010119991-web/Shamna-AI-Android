'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createVercelBlobVideoStore}=require('./vercel-blob-video-store.cjs');
const bytes=Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,109,112,52,50]);
const hash=createHash('sha256').update(bytes).digest('hex');
const uri='https://example.public.blob.vercel-storage.com/midan-media/videos/'+hash+'.mp4';
const log=[];
const blob={
 put:async(path,body,opts)=>{
  log.push({op:'put',path,access:opts.access,hasToken:opts.token==='backend-token-private'});
  return {url:uri,pathname:path};
 },
 head:async(url,opts)=>{
  log.push({op:'head',url,hasToken:opts.token==='backend-token-private'});
  return {url,pathname:'midan-media/videos/'+hash+'.mp4',size:bytes.length,contentType:'video/mp4'};
 }
};
(async()=>{
 const store=createVercelBlobVideoStore({blob,token:'backend-token-private',
  allowedStorageHosts:['example.public.blob.vercel-storage.com']});
 const item=await store.persist({kind:'video',verified:true,sha256:hash,size:bytes.length,bytes,
  uri:'https://publisher.example.org/story.mp4',contentType:'video/mp4'});
 assert.equal(item.uri,uri);assert.equal(item.verified,true);
 assert.deepEqual(log.map(l=>l.op),['put','head']);
 assert.ok(log.every(l=>l.hasToken));
 assert.equal(log[0].access,'public');
 assert.throws(()=>createVercelBlobVideoStore({blob,token:'bad',
  allowedStorageHosts:['example.public.blob.vercel-storage.com']}),/TOKEN_REQUIRED/);
 const wrong={...blob,head:async()=>({url:uri,pathname:'wrong',size:bytes.length,contentType:'video/mp4'})};
 const failed=createVercelBlobVideoStore({blob:wrong,token:'backend-token-private',
  allowedStorageHosts:['example.public.blob.vercel-storage.com']});
 await assert.rejects(()=>failed.persist({kind:'video',verified:true,sha256:hash,size:bytes.length,bytes,
  uri:'https://publisher.example.org/story.mp4',contentType:'video/mp4'}),/READBACK_MISMATCH/);
 console.log('PASS: server-only Vercel Blob put/head, approved public receipt and readback integrity');
})().catch(e=>{console.error(e);process.exitCode=1});
