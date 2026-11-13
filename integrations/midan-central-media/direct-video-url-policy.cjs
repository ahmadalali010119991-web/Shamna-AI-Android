'use strict';
/**
 * Conservative source URL stability policy for the no-storage video route.
 * "Stable" means only no detected signed/ephemeral link attributes. It does
 * not guarantee long-term availability; source outages remain possible.
 */
function createDirectVideoUrlPolicy({allowedHosts=[]}={}){
 if(!Array.isArray(allowedHosts)||!allowedHosts.length||
  !allowedHosts.every(h=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)))
  throw Error('DIRECT_VIDEO_ALLOWED_HOSTS_REQUIRED');
 const hosts=new Set(allowedHosts.map(h=>h.toLowerCase()));
 return async function stableUrl(value){
  let u;try{u=new URL(value)}catch{return false}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!hosts.has(u.hostname.toLowerCase()))
   return false;
  if(u.href.length>1900)return false;
  // These are common signs of a short-lived CDN token. Unknown parameters
  // are intentionally rejected too: explicit media path only.
  if(u.search)return false;
  if(!/\.(?:mp4|webm|mov)$/i.test(u.pathname))return false;
  return true;
 };
}
module.exports={createDirectVideoUrlPolicy};
