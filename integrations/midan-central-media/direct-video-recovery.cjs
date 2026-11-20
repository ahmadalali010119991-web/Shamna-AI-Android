'use strict';
/**
 * Blob-independent, permission-checked direct video route.
 * Only returns a candidate after binary verification and anonymous playback
 * checks. Source URL delivery is not equivalent to durable media ownership.
 * Never assume a social-media webpage is a video URL.
 */
function createDirectVideoRecovery({discovery,downloader,playback,canReuse,stableUrl}={}){
 if(!discovery?.discover||!downloader?.download||!playback?.check||
  typeof canReuse!=='function'||typeof stableUrl!=='function')
  throw Error('DIRECT_RECOVERY_DEPS_REQUIRED');
 return {
  id:'trusted-public-original-video',
  async run(story){
   if(!story?.sourceUrl)throw Error('SOURCE_URL_REQUIRED');
   if(await canReuse(story.sourceUrl,story)!==true){
    const e=Error('SOURCE_VIDEO_REUSE_NOT_AUTHORIZED');e.permanent=true;throw e;
   }
   const discovered=await discovery.discover(story.sourceUrl);
   if(!Array.isArray(discovered)||!discovered.length)return null;
   const failures=[];
   for(const candidate of discovered){
    if(candidate?.kind!=='video'||!candidate.uri)continue;
    if(await stableUrl(candidate.uri,story)!==true){
     failures.push('URL_UNSTABLE_OR_EXPIRING');continue;
    }
    try {
     const binary=await downloader.download(candidate);
     if(binary.kind!=='video'||binary.verified!==true||!binary.sha256)
      throw Error('BINARY_VERIFICATION_REQUIRED');
     // Never expose the in-memory video bytes or secret credentials to the
     // website/Telegram metadata adapter.
     const {bytes,...details}=binary;
     const checked=await playback.check(details);
     if(checked?.publiclyPlayable!==true||checked?.sha256!==binary.sha256||
      checked?.uri!==candidate.uri)
      throw Error('PUBLIC_PLAYBACK_NOT_CONFIRMED');
     return {...checked,origin:'source-original-direct',storageKind:'external',
      // This is a URL-dependent media route, not a durable media copy.
      durability:'source-dependent'};
    }catch(e){failures.push(String(e?.message||e).slice(0,90));}
   }
   if(failures.length)throw Error('DIRECT_VIDEO_RETRY:'+failures.slice(0,3).join(','));
   return null;
  }
 };
}
module.exports={createDirectVideoRecovery};
