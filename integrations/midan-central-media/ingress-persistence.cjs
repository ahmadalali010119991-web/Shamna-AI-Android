'use strict';
function createIngressPersistence({url,serviceRoleKey,fetcher=globalThis.fetch}={}){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url||'')||!serviceRoleKey)throw Error('SUPABASE_INGRESS_CONFIG_REQUIRED');
 const endpoint=url.replace(/\/$/,'')+'/rest/v1/rpc/';
 async function rpc(name,args){
  const r=await fetcher(endpoint+name,{method:'POST',headers:{apikey:serviceRoleKey,
   Authorization:'Bearer '+serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw Error('INGRESS_RPC_FAILED_'+name+'_'+r.status);
  return r.json();
 }
 return {
  consumeNonce:(nonce)=>rpc('midan_media_consume_nonce',{p_nonce:nonce}),
  enqueue:({key,article})=>rpc('midan_media_enqueue',{p_key:key,p_event:article})
 };
}
module.exports={createIngressPersistence};
