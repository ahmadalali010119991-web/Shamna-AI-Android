'use strict';
/**
 * Safe, lazy source-video metadata lookup for published Midan articles.
 * No copying, proxying, transcoding or storing third-party media.
 * Article ID must already be present in Midan's published news API.
 */
const NEWS='https://midan-al-khabar.vercel.app/api/news';
const VOICES='https://midan-al-khabar.vercel.app/api/citizen?voices=public';
const TRUSTED=new Set(['sana.sy','www.sana.sy','www.france24.com','arabic.euronews.com',
 'www.aa.com.tr','www.dw.com','www.bbc.com','www.aljazeera.net','www.theguardian.com',
 't.me','www.t.me','www.aljazeera.com','www.euronews.com','www.france24.com']);
const CACHE=new Map(),MAX_HTML=1200000;
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
function safeHttps(raw,base){
 try{const u=new URL(decode(raw),base);if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;return u.href}catch{return null}
}
function attrs(tag){const r={};for(const m of String(tag).matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))r[m[1].toLowerCase()]=decode(m[3]);return r}
function classifyVideo(raw,base){
 const url=safeHttps(raw,base);if(!url)return null;let u;try{u=new URL(url)}catch{return null}
 const host=u.hostname.toLowerCase();
 if(/^(?:www\.)?youtube\.com$/.test(host)||host==='www.youtube-nocookie.com'){
  const m=u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
  if(m)return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+m[1]};
  const id=u.searchParams.get('v');if(id&&/^[a-zA-Z0-9_-]{11}$/.test(id))return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+id}
 }
 if(host==='youtu.be'){const id=u.pathname.slice(1);if(/^[a-zA-Z0-9_-]{11}$/.test(id))return {kind:'embed',url:'https://www.youtube-nocookie.com/embed/'+id}}
 if(host==='player.vimeo.com'&&/^\/video\/\d+/.test(u.pathname))return {kind:'embed',url};
 if(['www.dailymotion.com','geo.dailymotion.com'].includes(host)&&/\/embed\/video\//.test(u.pathname))return {kind:'embed',url};
 if(/\.mp4(?:$|[?#])/i.test(url)||/\/mp4\//i.test(u.pathname))return {kind:'mp4',url};
 return null;
}
function extract(html,base){
 const candidates=[];
 for(const m of String(html).matchAll(/<meta\b[^>]*>/gi)){
  const a=attrs(m[0]),k=String(a.property||a.name||'').toLowerCase();
  if(['og:video:secure_url','og:video','og:video:url','twitter:player:stream'].includes(k)&&a.content)candidates.push(a.content)
 }
 for(const m of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const stack=[JSON.parse(m[1])];for(let i=0;i<35&&stack.length;i++){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue}if(!v||typeof v!=='object')continue;if(String(v['@type']||'').includes('VideoObject')){if(v.contentUrl)candidates.push(v.contentUrl);if(v.embedUrl)candidates.push(v.embedUrl)}if(v['@graph'])stack.push(v['@graph']);if(v.video)stack.push(v.video)}}catch{}
 }
 for(const m of String(html).matchAll(/<(?:video|source|iframe)\b[^>]*>/gi)){const a=attrs(m[0]);if(a.src)candidates.push(a.src)}
 for(const candidate of candidates){const video=classifyVideo(candidate,base);if(video)return video}
 return null;
}
async function fetchHtml(url){
 let target=url;
 for(let i=0;i<3;i++){
  const u=new URL(target);if(!TRUSTED.has(u.hostname.toLowerCase()))throw Error('Untrusted source host');
  const response=await fetch(target,{redirect:'manual',headers:{accept:'text/html,application/xhtml+xml','user-agent':'MidanAlKhabarBot/5.0 (article media metadata)'},signal:AbortSignal.timeout(9000)});
  if([301,302,303,307,308].includes(response.status)){
   target=safeHttps(response.headers.get('location'),target);if(!target)throw Error('Unsafe redirect');continue
  }
  if(!response.ok)throw Error('Source HTTP '+response.status);
  const type=response.headers.get('content-type')||'';if(!/text\/html|application\/xhtml/i.test(type))throw Error('Non-HTML source');
  const len=+(response.headers.get('content-length')||0);if(len>MAX_HTML)throw Error('Source HTML too large');
  const chunks=[];let size=0;for await(const buf of response.body){size+=buf.length;if(size>MAX_HTML)throw Error('Source HTML exceeds limit');chunks.push(Buffer.from(buf))}
  return {url:target,html:Buffer.concat(chunks).toString('utf8')};
 }
 throw Error('Too many redirects');
}
async function findPublished(id){
 const response=await fetch(NEWS,{signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
 if(!response.ok)throw Error('News feed unavailable');
 const json=await response.json(),all=Array.isArray(json.articles)?json.articles:[];
 let a=all.find(x=>String(x.id)===id);
 if(a)return a;
 try{
  const r=await fetch(VOICES,{signal:AbortSignal.timeout(7000)});
  if(r.ok){const j=await r.json();const v=[...(j.items||[]),...(j.archive||[])];a=v.find(x=>String(x.id)===id);if(a)return a}
 }catch{}
 return null;
}
async function resolve(id){
 const key=String(id||'').trim();if(!/^[a-zA-Z0-9_-]{4,130}$/.test(key))return {ok:false,reason:'invalid_id'};
 let article=await findPublished(key);
 if(!article)return {ok:false,reason:'not_published'};
 if(article.videoUrl){const video=classifyVideo(article.videoUrl);if(video)return {ok:true,...video,source:safeHttps(article.url)||null}}
 const source=safeHttps(article.url||article.sourceUrl||article.originalPostUrl||article.postUrl);
 if(!source||!TRUSTED.has(new URL(source).hostname.toLowerCase()))return {ok:false,reason:'source_not_eligible'};
 const cached=CACHE.get(source);if(cached&&Date.now()-cached.time<1800000)return cached.value;
 try{
  const page=await fetchHtml(source),video=extract(page.html,page.url);
  const value=video?{ok:true,...video,source}:{ok:false,reason:'no_embeddable_video'};
  if(CACHE.size>120)CACHE.clear();CACHE.set(source,{time:Date.now(),value});return value;
 }catch(e){return {ok:false,reason:'source_unavailable'}}
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','public,max-age=300');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({ok:false,reason:'get_only'});
 try{const result=await resolve(req.query?.id);return res.status(200).json(result)}catch(e){return res.status(503).json({ok:false,reason:'temporary_error'})}
};
module.exports.extract=extract;module.exports.classifyVideo=classifyVideo;module.exports.safeHttps=safeHttps;
