'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createVerifiedVideoStore}=require('./verified-video-store.cjs');
const bytes=Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,1]);
const hash=createHash('sha256').update(bytes).digest('hex');
const video={kind:'video',verified:true,sha256:hash,size:bytes.length,
 contentType:'video/mp4',uri:'https://cdn.example.org/story.mp4',bytes};
let uploads=[];
const store=createVerifiedVideoStore({allowedStorageHosts:['public.blob.vercel-storage.com'],
 head:async path=>({url:'https://public.blob.vercel-storage.com/'+path,pathname:path,size:bytes.length,contentType:'video/mp4'}),
 put:async(path,blob,options)=>{
  uploads.push({path,blob,options});
  return {url:'https://public.blob.vercel-storage.com/'+path,
    pathname:path};
 }});
(async()=>{
 const saved=await store.persist(video);
 assert.equal(saved.verified,true);
 assert.equal(saved.sha256,hash);
 assert.equal(saved.uri,'https://public.blob.vercel-storage.com/midan-media/videos/'+hash+'.mp4');
 assert.equal(uploads.length,1);
 assert.equal(uploads[0].blob.size,bytes.length);
 assert.equal(uploads[0].options.access,'public');
 assert.equal(uploads[0].options.addRandomSuffix,false);
 await assert.rejects(()=>store.persist({...video,verified:false}),/VERIFIED_VIDEO_REQUIRED/);
 await assert.rejects(()=>store.persist({...video,sha256:'a'.repeat(64)}),/MEDIA_HASH_MISMATCH/);
 const bad=createVerifiedVideoStore({allowedStorageHosts:['public.blob.vercel-storage.com'],head:async()=>null,
  put:async(path)=>({url:'https://evil.example.org/'+path,pathname:path})});
 await assert.rejects(()=>bad.persist(video),/UNTRUSTED_RECEIPT/);
 const broken=createVerifiedVideoStore({allowedStorageHosts:['public.blob.vercel-storage.com'],head:async()=>null,
  put:async()=>({})});
 await assert.rejects(()=>broken.persist(video),/UNCONFIRMED/);
 const badReadback=createVerifiedVideoStore({allowedStorageHosts:['public.blob.vercel-storage.com'],
  head:async()=>({url:'https://public.blob.vercel-storage.com/midan-media/videos/'+hash+'.mp4',pathname:'midan-media/videos/'+hash+'.mp4',size:999,contentType:'video/mp4'}),
  put:async path=>({url:'https://public.blob.vercel-storage.com/'+path,pathname:path})});
 await assert.rejects(()=>badReadback.persist(video),/READBACK_MISMATCH/);
 assert.throws(()=>createVerifiedVideoStore({put:()=>{}}),/DURABLE_PUBLIC/);
 console.log('PASS: immutable verified video storage, SHA integrity and destination receipt checks');
})().catch(e=>{console.error(e);process.exitCode=1});
