'use strict';
/**
 * Validate that a stored public video is anonymously playable, not only
 * readable with privileged storage credentials. Never follow redirects or
 * trust arbitrary URLs. This is transport validation, not source authenticity.
 */
function validPrefix(prefix,mime){
 if(!(prefix instanceof Uint8Array)||prefix.length<16)return false;
 if(mime==='video/webm')return prefix[0]===26&&prefix[1]===69&&prefix[2]===223&&prefix[3]===163;
 if(mime==='video/mp4'||mime==='video/quicktime'){
  const marker=String.fromCharCode(...prefix.slice(4,8));
  const box=new DataView(prefix.buffer,prefix.byteOffset,4).getUint32(0);
  return marker==='ftyp'&&box>=16&&box<4096;
 }
 return false;
}
function approvedUrl(raw,hosts){
 let u;try{u=new URL(raw)}catch{throw Error('PLAYBACK_URL_INVALID')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
    !Array.isArray(hosts)||!hosts.map(x=>String(x).toLowerCase()).includes(u.hostname.toLowerCase()))
    throw Error('PLAYBACK_HOST_NOT_ALLOWED');
 return u.href;
}
function createPublicVideoPlaybackCheck({allowedHosts=[],fetcher=globalThis.fetch,timeoutMs=12000}={}){
 if(!Array.isArray(allowedHosts)||!allowedHosts.length||typeof fetcher!=='function')throw Error('PUBLIC_VIDEO_CHECK_CONFIG_REQUIRED');
 return {async check(item){
  if(!item||item.kind!=='video'||!item.verified||!Number.isSafeInteger(item.size)||item.size<16 ||
    !['video/mp4','video/webm','video/quicktime'].includes(item.contentType))
    throw Error('VERIFIED_VIDEO_REQUIRED');
  const url=approvedUrl(item.uri,allowedHosts);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   // No authorization header: this must be consumable by the site/browser
   // and by Telegram servers without a private blob access token.
   const h=await fetcher(url,{method:'HEAD',redirect:'manual',signal:ctrl.signal});
   if(h.status!==200||h.redirected)throw Error('PUBLIC_VIDEO_HEAD_FAILED');
   if(Number(h.headers.get('content-length'))!==item.size)throw Error('PUBLIC_VIDEO_LENGTH_MISMATCH');
   if(String(h.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!==item.contentType)
    throw Error('PUBLIC_VIDEO_TYPE_MISMATCH');
   const r=await fetcher(url,{method:'GET',redirect:'manual',headers:{Range:'bytes=0-31'},signal:ctrl.signal});
   if(r.status!==206||r.redirected)throw Error('PUBLIC_VIDEO_RANGE_UNAVAILABLE');
   const cr=String(r.headers.get('content-range')||'');
   if(cr!=='bytes 0-31/'+item.size)throw Error('PUBLIC_VIDEO_RANGE_INVALID');
   if(!r.body?.getReader)throw Error('PUBLIC_VIDEO_STREAM_REQUIRED');
   const reader=r.body.getReader();let count=0,chunks=[];
   try{
    while(count<=32){
     const {done,value}=await reader.read();if(done)break;
     const b=value instanceof Uint8Array?value:new Uint8Array(value);
     count+=b.length;
     if(count>32)throw Error('PUBLIC_VIDEO_RANGE_OVERFLOW');
     chunks.push(b);
    }
   }finally{await reader.cancel().catch(()=>{})}
   if(count!==32)throw Error('PUBLIC_VIDEO_RANGE_TRUNCATED');
   const prefix=new Uint8Array(32);let offset=0;for(const c of chunks){prefix.set(c,offset);offset+=c.length}
   if(!validPrefix(prefix,item.contentType))throw Error('PUBLIC_VIDEO_SIGNATURE_INVALID');
   return {...item,publiclyPlayable:true,playbackVerifiedAt:new Date().toISOString()};
  }finally{clearTimeout(timer)}
 }};
}
module.exports={createPublicVideoPlaybackCheck,approvedUrl};
