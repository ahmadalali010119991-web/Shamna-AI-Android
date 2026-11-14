'use strict';
/**
 * Production-safe wrapper around the exact deployed V3 sync engine.
 * The complete original code lives at sync-v3-engine-legacy.cjs, unchanged.
 * Repair official video watch buttons on existing messages after news sync.
 * Missing embeds never block the original news, photos, or media retry cycle.
 */
const original=require('./sync-v3-engine-legacy.cjs');
const videos=require('./news-embed-video-buttons');
module.exports={...original,async run(...args){
 const result=await original.run(...args);
 try{
  const updates=await videos.repair({maxEdits:2});
  return result&&typeof result==='object'?{...result,videoWatchButtons:updates}:result;
 }catch(error){
  const details=String(error?.message||error).slice(0,160);
  console.warn('Midan video watch buttons, original news sync unaffected:',details);
  return result&&typeof result==='object'?{...result,videoWatchButtons:{error:details}}:result;
 }
}};
