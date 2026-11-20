'use strict';
/**
 * Conservative, source-bound HTML video discovery.
 * Discovery produces candidates, NEVER marks a video verified.
 * Only fetch HTML from explicitly trusted publisher hosts.
 */
const {URL}=require('node:url');
function safePublisherUrl(raw,allowedHosts) {
 let u;
 try {u=new URL(raw)}catch{throw Error('INVALID_PUBLISHER_URL')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)
  throw Error('INVALID_PUBLISHER_URL');
 const host=u.hostname.toLowerCase();
 if(!Array.isArray(allowedHosts)||!allowedHosts.some(h=>h===host))
  throw Error('PUBLISHER_NOT_ALLOWLISTED');
 if(/^\d+(\.\d+){3}$/.test(host)||host==='localhost')
  throw Error('INVALID_PUBLISHER_HOST');
 return u;
}
function decodeEntities(s){
 return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
 .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}
function extractAttributes(tag){
 const attrs={};
 for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
  attrs[m[1].toLowerCase()]=decodeEntities(m[2]??m[3]);
 return attrs;
}
function discoverCandidates(html,baseUrl){
 const found=[],seen=new Set();
 function add(value,origin){
  if(!value||found.length>=20)return;
  let u;try{u=new URL(decodeEntities(value),baseUrl)}catch{return}
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.'))return;
  if(/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname))return;
  if(seen.has(u.href))return;
  seen.add(u.href);found.push({uri:u.href,origin,kind:'video',verified:false});
 }
 for(const match of String(html).matchAll(/<meta\b[^>]*>/gi)){
  const a=extractAttributes(match[0]);
  const key=(a.property||a.name||'').toLowerCase();
  if(['og:video','og:video:url','og:video:secure_url','twitter:player:stream'].includes(key))
   add(a.content,'meta:'+key);
 }
 for(const match of String(html).matchAll(/<(?:video|source)\b[^>]*>/gi)){
  const attrs=extractAttributes(match[0]);
  if(attrs.src)add(attrs.src,'html:'+match[0].slice(1,7).replace(/\s.*/,''));
 }
 return found;
}
function createVideoDiscovery({allowedHosts=[],fetcher=globalThis.fetch,timeoutMs=9000,maxHtmlBytes=350000}={}){
 if(!Array.isArray(allowedHosts)||allowedHosts.length===0)throw Error('ALLOWED_HOSTS_REQUIRED');
 const hosts=allowedHosts.map(h=>String(h).toLowerCase());
 if(!hosts.every(h=>/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(h)))throw Error('INVALID_HOST');
 async function discover(sourceUrl){
  const url=safePublisherUrl(sourceUrl,hosts);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  let response;
  try{
   response=await fetcher(url.href,{method:'GET',redirect:'manual',headers:{Accept:'text/html'},
    signal:ctrl.signal});
   if(!response.ok||response.status>=300||response.status<200)throw Error('PUBLISHER_FETCH_FAILED');
   if(!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')||''))
    throw Error('PUBLISHER_NOT_HTML');
   const len=Number(response.headers.get('content-length')||'0');
   if(len>maxHtmlBytes)throw Error('HTML_TOO_LARGE');
   const html=await response.text();
   if(Buffer.byteLength(html,'utf8')>maxHtmlBytes)throw Error('HTML_TOO_LARGE');
   return discoverCandidates(html,url.href);
  }finally{clearTimeout(timer);}
 }
 return {discover};
}
module.exports={discoverCandidates,createVideoDiscovery,safePublisherUrl};
