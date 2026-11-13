'use strict';
const {createHash}=require('node:crypto');
/**
 * Persist validated video under an immutable content-addressed path.
 * put is a server-only storage callback. A signed or public playable media
 * URL must be returned by storage before downstream publication.
 * Source reuse permission must be checked by the caller.
 */
function createVerifiedVideoStore({put,storagePrefix='midan-media/videos',allowedStorageHosts=[]}={}){
 if(typeof put!=='function'||!Array.isArray(allowedStorageHosts)||allowedStorageHosts.length===0)
  throw Error('DURABLE_PUBLIC_MEDIA_STORE_REQUIRED');
 if(!/^[a-z0-9/_-]{4,100}$/.test(storagePrefix)||storagePrefix.includes('..'))
  throw Error('INVALID_STORAGE_PREFIX');
 return {
  async persist(video){
   if(!video||video.kind!=='video'||video.verified!==true||
    !/^[a-f0-9]{64}$/.test(String(video.sha256||''))||
    !(video.bytes instanceof Uint8Array)||video.bytes.length!==video.size||
    !['video/mp4','video/webm','video/quicktime'].includes(video.contentType))
    throw Error('VERIFIED_VIDEO_REQUIRED');
   if(createHash('sha256').update(video.bytes).digest('hex')!==video.sha256)throw Error('MEDIA_HASH_MISMATCH');
   const suffix=video.contentType==='video/webm'?'.webm':video.contentType==='video/quicktime'?'.mov':'.mp4';
   const path=storagePrefix+'/'+video.sha256+suffix;
   const stored=await put(path,new Blob([video.bytes],{type:video.contentType}),{
    access:'public',addRandomSuffix:false,contentType:video.contentType
   });
   if(!stored?.url)throw Error('MEDIA_STORAGE_UNCONFIRMED');
   let url;
   try{url=new URL(stored.url)}catch{throw Error('MEDIA_STORAGE_INVALID_URL')}
   if(url.protocol!=='https:'||url.username||url.password||url.port||
    !allowedStorageHosts.map(x=>String(x).toLowerCase()).includes(url.hostname.toLowerCase())||
    !String(stored.pathname||'').endsWith('/'+video.sha256+suffix))
    throw Error('MEDIA_STORAGE_UNTRUSTED_RECEIPT');
   return {kind:'video',uri:url.href,verified:true,sha256:video.sha256,
    size:video.size,contentType:video.contentType,origin:video.uri,storagePath:path};
  }
 };
}
module.exports={createVerifiedVideoStore};
