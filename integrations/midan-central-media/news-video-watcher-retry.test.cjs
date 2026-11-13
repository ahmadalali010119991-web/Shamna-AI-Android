'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const source=fs.readFileSync(path.join(__dirname,'news-video-watcher-retry.cjs'),'utf8');
test('transient 503 is retried; unrelated Telegram and other URLs are not retried',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'midan-watcher-'));
 try{
  fs.writeFileSync(path.join(temp,'news-embed-video-buttons.js'),source);
  fs.writeFileSync(path.join(temp,'news-embed-video-buttons-legacy.cjs'),
   "module.exports={repair:async({fetcher})=>{await fetcher('https://midan-al-khabar.vercel.app/api/news');await fetcher('https://t.me/s/maydan_alkhabar');return true;}}");
  const retry=require(path.join(temp,'news-embed-video-buttons.js'));
  let site=0,secondary=0,telegram=0;
  const beforeFetch=globalThis.fetch;
  globalThis.fetch=async()=>{secondary++;return {status:200}};
  try{
   const result=await retry.repair({fetcher:async url=>{
    if(url.includes('midan-al-khabar')){site++;return {status:503};}
    telegram++;return {status:200};
   }});
   assert.equal(result,true);assert.equal(site,1);assert.equal(secondary,1);
   assert.equal(telegram,1);
  }finally{globalThis.fetch=beforeFetch;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('persistent 503 returns after exactly three attempts',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'midan-watcher-'));
 try{
  fs.writeFileSync(path.join(temp,'news-embed-video-buttons.js'),source);
  fs.writeFileSync(path.join(temp,'news-embed-video-buttons-legacy.cjs'),
   "module.exports={repair:async({fetcher})=>(await fetcher('https://midan-al-khabar.vercel.app/api/news')).status}");
  const retry=require(path.join(temp,'news-embed-video-buttons.js'));
  let count=0,secondary=0;
  const beforeFetch=globalThis.fetch;
  globalThis.fetch=async()=>{secondary++;return {status:503}};
  try{
   assert.equal(await retry.repair({fetcher:async()=>{count++;return {status:503}}}),503);
   assert.equal(count,2);assert.equal(secondary,1);
  }finally{globalThis.fetch=beforeFetch;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
