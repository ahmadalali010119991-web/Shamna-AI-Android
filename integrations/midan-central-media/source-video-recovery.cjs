'use strict';
/**
 * Video recovery adapter: discover -> bounded download/validate -> durable store.
 * A single stored immutable URL can be supplied to site and Telegram. No fallback
 * to a photo while this adapter has a pending retry.
 */
function createSourceVideoRecovery({discovery,downloader,store,canReuse}={}){
 if(!discovery?.discover||!downloader?.download||!store?.persist||
    typeof canReuse!=='function')throw Error('VIDEO_RECOVERY_DEPENDENCIES_REQUIRED');
 return {id:'source-discovered-video-to-durable-store',async run(story){
  if(!story?.sourceUrl)throw Error('SOURCE_URL_REQUIRED');
  if(await canReuse(story.sourceUrl,story)!==true){
   const error=Error('SOURCE_MEDIA_REUSE_NOT_AUTHORIZED');
   error.permanent=true;throw error;
  }
  const refs=await discovery.discover(story.sourceUrl);
  if(!Array.isArray(refs)||refs.length===0)return null;
  const errors=[];
  for(const ref of refs){
   if(ref?.kind!=='video'||!ref.uri)continue;
   try{
    const verified=await downloader.download(ref);
    if(!verified?.verified)throw Error('VIDEO_VALIDATION_REQUIRED');
    const persisted=await store.persist(verified);
    if(!persisted?.verified||persisted?.kind!=='video'||!persisted.uri)
     throw Error('DURABLE_MEDIA_CONFIRMATION_MISSING');
    return persisted;
   }catch(e){errors.push(String(e?.message||e).slice(0,100));}
  }
  if(errors.length)throw Error('VIDEO_RECOVERY_RETRY:'+errors.slice(0,3).join(','));
  return null;
 }};
}
module.exports={createSourceVideoRecovery};
