'use strict';
const {verifyEnvelope}=require('./signed-handoff.cjs');
/**
 * Vercel-compatible POST ingress: validates a signed incoming news event,
 * consumes its nonce durably, then enqueues it. Never publishes synchronously.
 * Dependency-injected to prevent accidental activation on existing sites.
 */
function createMediaHandoffHandler({secret,consumeNonce,enqueue,maxBytes=131072,clock=()=>Date.now()}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('HANDOFF_SECRET_REQUIRED');
 if(typeof consumeNonce!=='function'||typeof enqueue!=='function')throw Error('PERSISTENT_INGRESS_DEPENDENCIES_REQUIRED');
 return async function handler(req,res){
  const finish=(status,obj)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json(obj)};
  if(req.method!=='POST')return finish(405,{ok:false,error:'METHOD_NOT_ALLOWED'});
  if(req.headers?.['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
   return finish(415,{ok:false,error:'EXPECTED_JSON'});
  let raw=req.rawBody;
  if(Buffer.isBuffer(raw))raw=raw.toString('utf8');
  // A signed request needs byte-exact payload; do NOT JSON.stringify(req.body).
  if(typeof raw!=='string')return finish(400,{ok:false,error:'RAW_BODY_REQUIRED'});
  if(Buffer.byteLength(raw)>maxBytes)return finish(413,{ok:false,error:'BODY_TOO_LARGE'});
  let parsed;
  try {
   parsed=await verifyEnvelope({rawBody:raw,headers:req.headers,secret,consumeNonce,now:clock()});
  }catch(e){
   const code=String(e?.message||'');
   if(code==='REPLAY_DETECTED')return finish(409,{ok:false,error:code});
   if(code==='PERSISTENT_NONCE_STORE_REQUIRED')return finish(503,{ok:false,error:'NONCE_STORE_UNAVAILABLE'});
   if(code.startsWith('SIGNATURE_')||code.startsWith('HANDOFF_SECRET_'))return finish(401,{ok:false,error:'UNAUTHORIZED'});
   return finish(400,{ok:false,error:'INVALID_ENVELOPE'});
  }
  try {
   const outcome=await enqueue(parsed);
   if(!outcome?.accepted||!outcome?.jobId)throw Error('ENQUEUE_UNCONFIRMED');
   return finish(outcome.alreadyExists?200:202,{
    ok:true,queued:true,alreadyExists:!!outcome.alreadyExists,key:parsed.key,jobId:String(outcome.jobId)
   });
  }catch {
   // If enqueue fails the consumed nonce prevents retries of the exact request.
   // The sender MUST create a fresh nonce and retry with the SAME article key.
   return finish(503,{ok:false,error:'PERSISTENCE_UNAVAILABLE',retryWithNewNonce:true});
  }
 };
}
module.exports={createMediaHandoffHandler};
