'use strict';
const assert=require('node:assert/strict');
const {resolve,parseMatchingPost,exactSourceLink}=require('./telegram-native-video-site-fallback.cjs');
const src='https://www.france24.com/ar/video/20261113-syria-story';
const video='<div class="tgme_widget_message_wrap"><div data-post="maydan_alkhabar/708"><a href="'+src+'">الخبر في مصدره</a><a class="tgme_widget_message_video" href="/"></a></div></div>';
const photo='<div class="tgme_widget_message_wrap"><div data-post="maydan_alkhabar/709"><a href="'+src+'">الخبر في مصدره</a><a class="tgme_widget_message_photo_wrap" href="/"></a></div></div>';
const unrelated='<div class="tgme_widget_message_wrap"><div data-post="maydan_alkhabar/710"><a href="https://another.example.org/post">الخبر</a><video src="/anything.mp4"></video></div></div>';
assert.equal(parseMatchingPost(video,src).url,'https://t.me/maydan_alkhabar/708?embed=1');
assert.equal(parseMatchingPost(photo,src),null,'photo must not be mislabeled as a native video');
assert.equal(parseMatchingPost(unrelated,src),null,'unrelated news video never attached');
assert.equal(exactSourceLink(video,src),true);
assert.equal(exactSourceLink(video,src+'/other'),false);
let fetches=[];
const mock=async (url,opts)=>{
 fetches.push(url);
 assert.equal(opts.redirect,'manual');
 return {status:200,redirected:false,headers:{get:()=> 'text/html; charset=UTF-8'},
  text:async()=>video};
};
(async()=>{
 const found=await resolve(src,{fetcher:mock,pages:2});
 assert.equal(found.channelMessageId,708);
 assert.equal(found.transport,'telegram_channel');
 assert.equal(found.kind,'embed');
 assert.equal(fetches.length,1);
 assert.equal(await resolve('http://127.0.0.1/local',{fetcher:mock}),null);
 const other=await resolve('https://example.org/unrelated',{fetcher:async()=>({status:200,headers:{get:()=> 'text/html'},text:async()=>unrelated})});
 assert.equal(other,null);
 console.log('PASS: public channel exact source match; native video only; no false photo mapping; embed transport; bounded fetch');
})().catch(e=>{console.error(e);process.exitCode=1});
