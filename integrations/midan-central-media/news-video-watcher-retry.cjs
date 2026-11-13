'use strict';
/**
 * Narrow recovery for intermittent site/API 503 in existing video-button watcher.
 * No changes to news publishing, Telegram writes, or content attribution.
 */
const legacy=require('./news-embed-video-buttons-legacy.cjs');
function recoverFetch(primary,secondary){
 return async function(url,options){
  const destination=String(typeof url==='string'?url:url?.url||'');
  if(!destination.startsWith('https://midan-al-khabar.vercel.app/api/news'))
   return primary(url,options);
  let response;
  for(let n=0;n<3;n++){
   const fetcher=n===1&&secondary!==primary?secondary:primary;
   response=await fetcher(url,options);
   if(response.status!==503)return response;
   if(n<2)await new Promise(resolve=>setTimeout(resolve,(n+1)*350));
  }
  return response;
 };
}
module.exports={...legacy,async repair(options={}){
 const original=options.fetcher||globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch;
 return legacy.repair({...options,fetcher:recoverFetch(original,globalThis.fetch)});
}};
