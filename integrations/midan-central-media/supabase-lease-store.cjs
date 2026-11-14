'use strict';
/**
 * Durable per-article lease store backed by Supabase PostgREST RPC.
 * Backend-only. NEVER ship the service-role key to client browsers.
 * Does not claim exactly-once external delivery; publishers must reconcile
 * ambiguous successes with their destination records.
 */
function createSupabaseLeaseStore({url,serviceRoleKey,fetcher=globalThis.fetch,leaseSeconds=300}={}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url||''))
  throw Error('SUPABASE_PROJECT_URL_REQUIRED');
 if(!serviceRoleKey || typeof fetcher!=='function')throw Error('SUPABASE_SERVICE_KEY_REQUIRED');
 if(!Number.isInteger(leaseSeconds)||leaseSeconds<30||leaseSeconds>900)throw Error('INVALID_LEASE_SECONDS');
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/rpc/';
 async function rpc(method,body){
  const response=await fetcher(endpoint+method,{
   method:'POST',headers:{apikey:serviceRoleKey,Authorization:'Bearer '+serviceRoleKey,
    'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify(body)
  });
  if(!response?.ok)throw Error('SUPABASE_RPC_'+method+'_HTTP_'+response?.status);
  return response.json();
 }
 return {
  async transaction(key,work){
   if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_ARTICLE_KEY');
   const claimed=await rpc('midan_media_claim',{p_key:key,p_seconds:leaseSeconds});
   if(!claimed?.token)throw Error('ARTICLE_LEASE_BUSY');
   const token=claimed.token;
   const ensureLease=async()=>{
    const ok=await rpc('midan_media_renew',{p_key:key,p_token:token,p_seconds:leaseSeconds});
    if(ok!==true)throw Error('ARTICLE_LEASE_LOST');
   };
   const save=async(state)=>{
    const ok=await rpc('midan_media_save',{p_key:key,p_token:token,p_state:state});
    if(ok!==true)throw Error('ARTICLE_LEASE_LOST');
   };
   try{return await work(claimed.state||{},save,ensureLease);}
   finally{
    try{await rpc('midan_media_release',{p_key:key,p_token:token});}
    catch{/* Lease expires server-side; preserve work error if any. */}
   }
  }
 };
}
module.exports={createSupabaseLeaseStore};
