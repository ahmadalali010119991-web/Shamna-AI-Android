'use strict';
const crypto=require('node:crypto');
/**
 * Vercel server-only adapter for Supabase Edge Function "midan-media-retry".
 * Uses a dedicated shared server secret, NOT a Supabase service-role key.
 */
function createMediaRetryGateway({projectUrl,bridgeKey,fetcher=globalThis.fetch,timeoutMs=12000}={}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(projectUrl||''))throw Error('INVALID_SUPABASE_PROJECT_URL');
 if(typeof bridgeKey!=='string'||bridgeKey.length<40||bridgeKey.length>160)throw Error('RETRY_GATEWAY_SECRET_REQUIRED');
 if(typeof fetcher!=='function')throw Error('FETCH_REQUIRED');
 const endpoint=projectUrl.replace(/\/$/,'')+'/functions/v1/midan-media-retry';
 const keyFor=({channel,sourceId,targetMessageId})=>{
  if(!/^[a-zA-Z0-9_@-]{2,80}$/.test(channel||'')||!/^\d{1,18}$/.test(String(sourceId))||
     !Number.isSafeInteger(Number(targetMessageId))||Number(targetMessageId)<=0)throw Error('INVALID_JOB_ID');
  return crypto.createHash('sha256').update([channel,sourceId,targetMessageId].join('\n')).digest('hex');
 };
 async function call(op,params){
  let r;
  try{r=await fetcher(endpoint,{method:'POST',headers:{
   'x-midan-retry-key':bridgeKey,'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify({op,params}),signal:AbortSignal.timeout(timeoutMs)});
  }catch(err){throw Error('RETRY_GATEWAY_UNREACHABLE',{cause:err});}
  if(!r?.ok)throw Error('RETRY_GATEWAY_HTTP_'+String(r?.status));
  let j;try{j=await r.json()}catch{throw Error('RETRY_GATEWAY_BAD_JSON')}
  if(j?.ok!==true)throw Error('RETRY_GATEWAY_REJECTED');
  return j.result;
 }
 return {
  keyFor,
  ping:()=>call('ping',{}),
  async enqueue(id,payload){
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>24000)
    throw Error('INVALID_JOB_PAYLOAD');
   return call('enqueue',{p_key:keyFor(id),p_payload:payload});
  },
  claim:(seconds=120)=>call('claim',{p_seconds:seconds}),
  renew:(key,token,seconds=120)=>call('renew',{p_key:key,p_token:token,p_seconds:seconds}),
  async complete(key,token,{messageId,videoFileId}={}){
   if(!Number.isSafeInteger(messageId)||messageId<=0||
      typeof videoFileId!=='string'||videoFileId.trim().length<8)
    throw Error('CONFIRMED_TELEGRAM_NATIVE_VIDEO_REQUIRED');
   return call('complete',{p_key:key,p_token:token,p_telegram_message_id:messageId,p_telegram_file_id:videoFileId});
  },
  fail:(key,token,error)=>call('fail',{p_key:key,p_token:token,p_error:String(error?.message||error||'unknown').slice(0,240)})
 };
}
module.exports={createMediaRetryGateway};
