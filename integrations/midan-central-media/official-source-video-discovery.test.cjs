'use strict';
const assert=require('node:assert/strict');
const {createVideoDiscovery,discoverCandidates,safePublisherUrl}=require('./official-source-video-discovery.cjs');
(async()=>{
 const html=[
  '<html><head><meta property="og:video:secure_url" content="https://cdn.example.org/v.mp4?x=1&amp;y=2">',
  '<meta name="twitter:player:stream" content="https://cdn.example.org/v.mp4?x=1&amp;y=2">',
  '</head><body><video controls src="/assets/clip.mp4"></video><video poster="/thumbnail.jpg">',
  '<source src="https://media.example.org/clip.webm" type="video/webm"></video></body></html>'
 ].join('');
 const candidates=discoverCandidates(html,'https://publisher.example.org/news/1');
 assert.equal(candidates.length,3);
 assert.equal(candidates[0].verified,false);
 assert.equal(candidates[0].uri,'https://cdn.example.org/v.mp4?x=1&y=2');
 assert.equal(candidates[1].uri,'https://publisher.example.org/assets/clip.mp4');
 assert.equal(candidates[2].uri,'https://media.example.org/clip.webm');
 assert.equal(discoverCandidates('<meta property="og:image" content="https://x.com/image.jpg">','https://publisher.example.org/a').length,0);
 assert.throws(()=>safePublisherUrl('https://attacker.example.org/news',['publisher.example.org']),/ALLOWLIST/);
 assert.throws(()=>safePublisherUrl('http://publisher.example.org/news',['publisher.example.org']),/INVALID/);
 const calls=[];
 const fetcher=async(uri,opts)=>{
  calls.push({uri,opts});
  return {ok:true,status:200,headers:{get:k=>k==='content-type'?'text/html; charset=utf-8':null},text:async()=>html};
 };
 const discovery=createVideoDiscovery({allowedHosts:['publisher.example.org'],fetcher});
 const found=await discovery.discover('https://publisher.example.org/news/1');
 assert.equal(found.length,3);assert.equal(calls[0].opts.redirect,'manual');
 await assert.rejects(()=>discovery.discover('https://not-allowed.example.org/article'),/ALLOWLIST/);
 const oversized=createVideoDiscovery({allowedHosts:['publisher.example.org'],fetcher:async()=>({
  ok:true,status:200,headers:{get:k=>k==='content-type'?'text/html':k==='content-length'?'400000':null}
 })});
 await assert.rejects(()=>oversized.discover('https://publisher.example.org/a'),/HTML_TOO_LARGE/);
 const redirect=createVideoDiscovery({allowedHosts:['publisher.example.org'],fetcher:async()=>({
  ok:false,status:302,headers:{get:()=>null}
 })});
 await assert.rejects(()=>redirect.discover('https://publisher.example.org/a'),/PUBLISHER_FETCH_FAILED/);
 console.log('PASS: publisher allowlist, candidate parsing, original media refs, no verified bypass, redirect and size guard');
})().catch(e=>{console.error(e);process.exitCode=1});
