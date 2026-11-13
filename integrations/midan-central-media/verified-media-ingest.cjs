'use strict';
/**
 * Bounded, allowlisted media downloader + signature validator.
 * A discovered video URL is not publishable until downloaded, validated,
 * and copied to durable owned storage. No untrusted redirects are followed.
 */
const crypto=require('node:crypto');
const MIME={'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function hostAllowed(uri,hosts) {
 let url;try{url=new URL(uri)}catch{throw Error('INVALID_MEDIA_URL')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
    !hosts.includes(url.hostname.toLowerCase()))throw Error('MEDIA_HOST_NOT_ALLOWED');
 return url.href;
}
function sniff(bytes) {
 const b=bytes;
 if(b.length>=12&&String.fromCharCode(...b.slice(4,8))==='ftyp'&&
   [0,1,2,3].every(i=>b[i+8]>=32&&b[i+8]<=126))return 'video/mp4';
 if(b.length>=4&&b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'video/webm';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return 'image/png';
 if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&
    String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
function createVerifiedMediaIngest({
 allowedHosts,fetcher=globalThis.fetch,persist,maxVideoBytes=45_000_000,
 maxImageBytes=9_000_000,timeoutMs=45000
}={}) {
 if(!Array.isArray(allowedHosts)||!allowedHosts.length||allowedHosts.some(h=>!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)))
  throw Error('MEDIA_HOST_ALLOWLIST_REQUIRED');
 if(typeof persist!=='function'||typeof fetcher!=='function')throw Error('DURABLE_MEDIA_STORAGE_REQUIRED');
 const hosts=allowedHosts.map(x=>x.toLowerCase());
 async function ingest(candidate,{kind='video',articleId}={}){
  if(!candidate?.uri||!['video','photo'].includes(kind)||!articleId)throw Error('MEDIA_INPUT_INVALID');
  const uri=hostAllowed(candidate.uri,hosts),max=kind==='video'?maxVideoBytes:maxImageBytes;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
   const response=await fetcher(uri,{method:'GET',redirect:'manual',signal:controller.signal,
     headers:{Accept:kind==='video'?'video/*':'image/*'}});
   if(!response.ok||response.status>=300)throw Error('MEDIA_DOWNLOAD_FAILED');
   const headerType=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(!MIME[headerType])throw Error('MEDIA_TYPE_UNSUPPORTED');
   if(kind==='video'&&!headerType.startsWith('video/'))throw Error('MEDIA_NOT_VIDEO');
   if(kind==='photo'&&!headerType.startsWith('image/'))throw Error('MEDIA_NOT_PHOTO');
   const length=Number(response.headers.get('content-length')||0);
   if(!Number.isFinite(length)||length<0||length>max)throw Error('MEDIA_TOO_LARGE');
   if(!response.body?.getReader)throw Error('STREAMING_REQUIRED');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{
    for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     if(!(value instanceof Uint8Array))throw Error('INVALID_MEDIA_CHUNK');
     size+=value.byteLength;
     if(size>max)throw Error('MEDIA_TOO_LARGE');
     chunks.push(value);
    }
   }finally{reader.releaseLock();}
   if(!size||(length&&length!==size))throw Error('MEDIA_INCOMPLETE');
   const bytes=Buffer.concat(chunks.map(c=>Buffer.from(c)),size);
   const detected=sniff(bytes);
   if(detected!==headerType)throw Error('MEDIA_SIGNATURE_MISMATCH');
   const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
   // persist must atomically return an owned durable URL; never expose transient buffer URLs.
   const stored=await persist({articleId,kind,bytes,mime:detected,sha256:checksum,
     sourceUrl:uri,extension:MIME[detected]});
   if(!stored?.uri||stored?.sha256!==checksum||stored?.durable!==true)
     throw Error('MEDIA_PERSISTENCE_UNCONFIRMED');
   return {kind,uri:stored.uri,verified:true,sha256:checksum,mime:detected,bytes:size,
     origin:uri,storageId:stored.id||null};
  }finally{clearTimeout(timer);}
 }
 return {ingest};
}
module.exports={createVerifiedMediaIngest,hostAllowed,sniff};
