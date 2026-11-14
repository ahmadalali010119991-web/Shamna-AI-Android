'use strict';
/**
 * Preserve existing news publisher and run optional embedded-video buttons at a
 * reduced cadence. Frequent Vercel cron checks were hitting site-news HTTP 503.
 */
const original=require('./sync-v3-engine-legacy.cjs');
const videos=require('./news-embed-video-buttons');
module.exports={...original,async run(...args){
 const result=await original.run(...args);
 const urgent=Number(result?.sentNews||0)>0;
 const tenMinuteWindow=new Date().getUTCMinutes()%10===0;
 if(!urgent&&!tenMinuteWindow)
  return result&&typeof result==='object'
   ?{...result,videoWatchButtons:{skipped:'10_minute_window'}}:result;
 try{
  const updates=await videos.repair({maxEdits:2});
  return result&&typeof result==='object'?{...result,videoWatchButtons:updates}:result;
 }catch(error){
  const details=String(error?.message||error).slice(0,160);
  console.warn('Midan video watch buttons, original news sync unaffected:',details);
  return result&&typeof result==='object'?{...result,videoWatchButtons:{error:details}}:result;
 }
}};
