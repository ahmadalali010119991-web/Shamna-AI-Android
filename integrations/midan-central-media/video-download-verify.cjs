'use strict';
/**
 * Server-only bounded video downloader / binary verifier.
 * Important: this module verifies file shape, NOT journalistic authenticity.
 * Accept only an explicit host allowlist with no redirect. Discovery alone never
 * marks video as verified.
 */
const {createHash}=require('node:crypto');
const ALLOWED_MIMES=new Set(['video/mp4','video/quicktime','video/webm']);
const GENERIC_MIMES=new Set(['application/octet-stream','binary/octet-stream']);
const MAX_BYTES_DEFAULT=45_000_000;
function checkedUrl(raw,allowedHosts){
 let u;try{u=new URL(raw)}catch{throw Error('INVALID_VIDEO_URL')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href.length>2500)
  throw Error('INVALID_VIDEO_URL');
 const h=u.hostname.toLowerCase();
 if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)||!Array.isArray(allowedHosts)||
  !allowedHosts.map(x=>String(x).toLowerCase()).includes(h))
  throw Error('VIDEO_HOST_NOT_ALLOWED');
 return u.href;
}
function validSignature(data,mime){
 if(!(data instanceof Uint8Array)||data.length<16)return false;
 if(mime==='video/mp4'||mime==='video/quicktime'){
  const box=String.fromCharCode(...data.subarray(4,8));
  const size=new DataView(data.buffer,data.byteOffset,4).getUint32(0);
  return box==='ftyp'&&size>=16&&size<=data.length;
 }
 if(mime==='video/webm')return data[0]===0x1a&&data[1]===0x45&&data[2]===0xdf&&data[3]===0xa3;
 return false;
}
function concat(chunks,total){const bytes=new Uint8Array(total);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length}return bytes}
function createVideoDownloader({allowedHosts,fetcher=globalThis.fetch,maxBytes=MAX_BYTES_DEFAULT,timeoutMs=30000}={}){
 if(!Array.isArray(allowedHosts)||!allowedHosts.length)throw Error('VIDEO_HOST_ALLOWLIST_REQUIRED');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<32||maxBytes>100_000_000)throw Error('INVALID_VIDEO_SIZE_LIMIT');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('INVALID_DOWNLOAD_TIMEOUT');
 if(typeof fetcher!=='function')throw Error('FETCH_REQUIRED');
 return {async download(candidate){
  if(!candidate||candidate.kind!=='video'||!candidate.uri)throw Error('VIDEO_CANDIDATE_REQUIRED');
  const uri=checkedUrl(candidate.uri,allowedHosts);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  let reader;
  try{
   const response=await fetcher(uri,{method:'GET',redirect:'manual',headers:{Accept:'video/mp4,video/webm,video/quicktime'},signal:ctrl.signal});
   if(!response||response.status<200||response.status>=300||response.redirected)throw Error('VIDEO_FETCH_FAILED');
   const type=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   const genericType=GENERIC_MIMES.has(type);
   if(!ALLOWED_MIMES.has(type)&&!genericType)throw Error('VIDEO_CONTENT_TYPE_INVALID');
   // Generic CDN types are acceptable only for a declared .mp4/.mov/.webm
   // path AND a matching binary signature. Never infer from a web page.
   let verifiedType=type;
   if(genericType){
    const pathname=new URL(uri).pathname.toLowerCase();
    if(/\.mp4$/.test(pathname))verifiedType='video/mp4';
    else if(/\.webm$/.test(pathname))verifiedType='video/webm';
    else if(/\.mov$/.test(pathname))verifiedType='video/quicktime';
    else throw Error('GENERIC_VIDEO_EXTENSION_REQUIRED');
   }
   const headerSize=Number(response.headers.get('content-length')||0);
   if(!Number.isSafeInteger(headerSize)||headerSize<0||headerSize>maxBytes)throw Error('VIDEO_TOO_LARGE');
   let total=0,chunks=[];
   if(!response.body?.getReader)throw Error('VIDEO_STREAM_REQUIRED');
   reader=response.body.getReader();
   while(true){
    const {done,value}=await reader.read();if(done)break;
    const chunk=value instanceof Uint8Array?value:new Uint8Array(value);
    total+=chunk.byteLength;
    if(total>maxBytes)throw Error('VIDEO_TOO_LARGE');
    chunks.push(chunk);
   }
   if(!total||total<16)throw Error('VIDEO_EMPTY_OR_TRUNCATED');
   if(headerSize&&headerSize!==total)throw Error('VIDEO_LENGTH_MISMATCH');
   const bytes=concat(chunks,total);chunks=[];
   if(!validSignature(bytes,verifiedType))throw Error('VIDEO_SIGNATURE_INVALID');
   const hash=createHash('sha256').update(bytes).digest('hex');
   return {kind:'video',verified:true,uri,contentType:verifiedType,declaredContentType:type,size:total,sha256:hash,
    // Keep bytes server-side for a trusted uploader only. Never JSON serialize.
    bytes};
  }finally{
   clearTimeout(timer);
   if(reader)try{await reader.cancel()}catch{}
  }
 }};
}
module.exports={createVideoDownloader,checkedUrl,validSignature};
