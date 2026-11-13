'use strict';
const crypto=require('node:crypto');
/** Server-only RPC queue. Keep serviceRoleKey off clients and out of logs. */
function createMediaRetryQueue({url,serviceRoleKey,fetcher=globalThis.fetch,timeoutMs=10000}={}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url||''))throw Error('SUPABASE_PROJECT_URL_REQUIRED');
 if(typeof serviceRoleKey!=='string'||serviceRoleKey.length<16)throw Error('SERVER_SERVICE_ROLE_REQUIRED');
 if(typeof fetcher!=='function')throw Error('FETCHER_REQUIRED');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)throw Error('INVALID_TIMEOUT');
 const base=url.replace(/\/$/,'')+'/rest/v1/rpc/';
 async function rpc(name,params){
  let res;
  try{res=await fetcher(base+name,{method:'POST',headers:{
   apikey:serviceRoleKey,authorization:'Bearer '+serviceRoleKey,
   'content-type':'application/json',accept:'application/json'},
   body:JSON.stringify(params),signal:AbortSignal.timeout(timeoutMs)});}
  catch(error){throw Error('RETRY_TRANSPORT_FAILURE',{cause:error});}
  if(!res?.ok)throw Error('RETRY_RPC_'+name+'_HTTP_'+String(res?.status));
  try{return await res.json()}catch{throw Error('RETRY_RPC_BAD_JSON')}
 }
 function keyFor({channel,sourceId,targetMessageId}){
  if(!/^[A-Za-z0-9_@-]{2,80}$/.test(channel||'')||
     !/^[0-9]{1,18}$/.test(String(sourceId))||
     !Number.isSafeInteger(Number(targetMessageId))||Number(targetMessageId)<=0)
    throw Error('INVALID_RETRY_ID');
  return crypto.createHash('sha256').update(`${channel}\n${sourceId}\n${targetMessageId}`).digest('hex');
 }
 const bounded=(seconds)=>{
  if(!Number.isInteger(seconds)||seconds<30||seconds>600)throw Error('INVALID_LEASE_SECONDS');
  return seconds;
 };
 return {
  keyFor,
  async enqueue(id,payload){
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('INVALID_RETRY_PAYLOAD');
   if(JSON.stringify(payload).length>24000)throw Error('RETRY_PAYLOAD_TOO_LARGE');
   return rpc('midan_retry_enqueue',{p_key:keyFor(id),p_payload:payload});
  },
  async claim(seconds=120){return rpc('midan_retry_claim',{p_seconds:bounded(seconds)});},
  async renew(jobKey,leaseToken,seconds=120){
   return rpc('midan_retry_renew',{p_key:jobKey,p_token:leaseToken,p_seconds:bounded(seconds)});
  },
  async complete(jobKey,leaseToken,{messageId,fileId=null}={}){
   if(!Number.isSafeInteger(messageId)||messageId<=0)throw Error('CONFIRMED_TELEGRAM_MESSAGE_ID_REQUIRED');
   return rpc('midan_retry_complete',{p_key:jobKey,p_token:leaseToken,
     p_telegram_message_id:messageId,p_telegram_file_id:fileId});
  },
  async fail(jobKey,leaseToken,error){
   return rpc('midan_retry_fail',{p_key:jobKey,p_token:leaseToken,
    p_error:String(error?.message||error||'unknown').slice(0,240)});
  }
 };
}
module.exports={createMediaRetryQueue};
