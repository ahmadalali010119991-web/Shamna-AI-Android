'use strict';
/**
 * Isolated transient 503 recovery for Midan's existing video-watch button
 * reconciliation. The original publisher and markup policy are unchanged.
 */
const legacy=require('./news-embed-video-buttons-legacy.cjs');
function withTransientRetry(fetcher){
 return async function(url,options){
  const destination=String(typeof url==='string'?url:url?.url||'');
  if(!destination.startsWith('https://midan-al-khabar.vercel.app/api/news'))return fetcher(url,options);
  let response;
  for(let n=0;n<3;n++){
   response=await fetcher(url,options);
   if(response.status!==503||n===2)return response;
   await new Promise(resolve=>setTimeout(resolve,(n+1)*350));
  }
  return response;
 };
}
module.exports={...legacy,async repair(options={}){
 const original=options.fetcher||globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch;
 return legacy.repair({...options,fetcher:withTransientRetry(original)});
}};
