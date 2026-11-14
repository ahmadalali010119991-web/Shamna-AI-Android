'use strict';
/** Authenticated, canonical cross-service news handoff. */
const crypto=require('node:crypto');
const {normalize,identity}=require('./media-contract.cjs');
const MAX_SKEW_MS=5*60*1000;
function sign(secret,{timestamp,nonce,body}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('HANDOFF_SECRET_TOO_SHORT');
 if(!Number.isSafeInteger(Number(timestamp))||!/^[a-zA-Z0-9_-]{16,80}$/.test(String(nonce||'')))throw Error('INVALID_SIGNATURE_METADATA');
 const payload=Buffer.from(String(body),'utf8');
 if(payload.length>128*1024)throw Error('HANDOFF_BODY_TOO_LARGE');
 const msg=Buffer.concat([Buffer.from('midan-media-v1\n'+timestamp+'\n'+nonce+'\n'),payload]);
 return crypto.createHmac('sha256',secret).update(msg).digest('hex');
}
function createEnvelope(raw,{secret,clock=Date.now(),nonce=crypto.randomBytes(20).toString('base64url')}={}){
 const article=normalize(raw);
 const timestamp=Number(clock);
 const body=JSON.stringify({version:1,key:identity(article),article});
 const signature=sign(secret,{timestamp,nonce,body});
 return {body,headers:{'content-type':'application/json','x-midan-timestamp':String(timestamp),
  'x-midan-nonce':nonce,'x-midan-signature':'sha256='+signature}};
}
async function verifyEnvelope({rawBody,headers,secret,consumeNonce,now=Date.now()}={}){
 if(typeof rawBody!=='string')throw Error('RAW_BODY_REQUIRED');
 const get=(name)=>headers?.[name]||headers?.[name.toLowerCase()]||headers?.[name.toUpperCase()];
 const timestamp=Number(get('x-midan-timestamp'));
 const nonce=String(get('x-midan-nonce')||'');
 const provided=String(get('x-midan-signature')||'');
 if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>MAX_SKEW_MS)throw Error('SIGNATURE_EXPIRED');
 if(!/^sha256=[a-f0-9]{64}$/.test(provided))throw Error('SIGNATURE_INVALID');
 const expected='sha256='+sign(secret,{timestamp,nonce,body:rawBody});
 if(!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))throw Error('SIGNATURE_INVALID');
 const decoded=JSON.parse(rawBody);
 if(decoded?.version!==1)throw Error('PROTOCOL_VERSION_UNSUPPORTED');
 const article=normalize(decoded.article);
 if(decoded.key!==identity(article))throw Error('ARTICLE_IDENTITY_MISMATCH');
 if(typeof consumeNonce!=='function')throw Error('PERSISTENT_NONCE_STORE_REQUIRED');
 // nonce store must atomically insert unique nonce with TTL >= 5min.
 const accepted=await consumeNonce(nonce,timestamp);
 if(accepted!==true)throw Error('REPLAY_DETECTED');
 return {key:decoded.key,article};
}
module.exports={sign,createEnvelope,verifyEnvelope};
