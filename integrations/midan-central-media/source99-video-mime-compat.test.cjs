'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'source99-mime-'));
const wrapper=fs.readFileSync(path.join(__dirname,'source99-video-mime-compat.cjs'),'utf8');
const original=[
 "'use strict';",
 "async function mediaBlob(url,{fetcher,video=false}={}){",
 " const r=await fetcher(url);",
 " const type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();",
 " const valid=video?['video/mp4','video/webm','video/quicktime']:['image/jpeg','image/png','image/webp'];",
 " if(!valid.includes(type))throw Error('UNSUPPORTED_TYPE');",
 " const arr=await r.arrayBuffer();",
 " const buf=new Uint8Array(arr);",
 " if(video&&type==='video/mp4'&&String.fromCharCode(...buf.slice(4,8))!=='ftyp')throw Error('INVALID_VIDEO_SIGNATURE');",
 " return {type,blob:new Blob([arr],{type})};",
 "}",
 "async function telegram(method,form){",
 " const data={result:form.result};",
 "  return data.result;",
 " }",
 "module.exports={mediaBlob,telegram};"
].join('\n');
const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,0,0,0,0,0]);
const jpg=Uint8Array.from([255,216,255,224,1,2,3,4]);
const mock=(mime,bytes)=>async()=>({headers:{get:k=>k==='content-type'?mime:null},arrayBuffer:async()=>bytes.buffer});
(async()=>{
 try{
  fs.writeFileSync(path.join(folder,'source99-direct-publisher.js'),wrapper);
  fs.writeFileSync(path.join(folder,'source99-direct-publisher-legacy.cjs'),original);
  const m=require(path.join(folder,'source99-direct-publisher.js'));
  const result=await m.mediaBlob('https://cdn.example.org/video',{video:true,fetcher:mock('binary/octet-stream',mp4)});
  assert.equal(result.type,'video/mp4');
  assert.equal(result.blob.size,mp4.length);
  const photo=await m.mediaBlob('https://cdn.example.org/photo',{video:false,fetcher:mock('image/jpeg',jpg)});
  assert.equal(photo.type,'image/jpeg');
  await assert.rejects(()=>m.mediaBlob('https://cdn.example.org/fake',{video:true,fetcher:mock('binary/octet-stream',jpg)}),/INVALID_VIDEO_SIGNATURE/);
  await assert.rejects(()=>m.mediaBlob('https://cdn.example.org/html',{video:true,fetcher:mock('text/html',mp4)}),/UNSUPPORTED_TYPE/);
  await assert.rejects(()=>m.telegram('sendVideo',{result:{message_id:9}}),/TELEGRAM_VIDEO_RECEIPT_MISSING/);
  assert.equal((await m.telegram('sendVideo',{result:{message_id:9,video:{file_id:'real-video'}}})).message_id,9);
  await assert.rejects(()=>m.telegram('sendPhoto',{result:{message_id:9}}),/TELEGRAM_PHOTO_RECEIPT_MISSING/);
  assert.equal((await m.telegram('sendPhoto',{result:{message_id:9,photo:[{file_id:'real-photo'}]}})).message_id,9);
  console.log('PASS: Source99 generic-MIME MP4 verification; photos unchanged; fake media rejected');
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
