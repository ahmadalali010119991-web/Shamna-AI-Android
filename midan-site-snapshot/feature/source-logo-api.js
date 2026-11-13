'use strict';
/* Source identity image proxy: never fetch user-specified websites; for news sites
 * request only Google's favicon endpoint, and for Telegram only public t.me profiles
 * with a validated channel handle. No private IP/port/redirect access. */
const TIMEOUT=5500,MAX_IMAGE=524288;
async function limited(url,accept){
 const r=await fetch(url,{redirect:'manual',headers:{'User-Agent':'MidanAlKhabar-SourceIdentity/1.0','Accept':accept||'image/png,image/webp,image/jpeg'} ,signal:AbortSignal.timeout(TIMEOUT)});
 if(r.status!==200)throw Error('source unavailable');
 return r;
}
function validImageURL(v){
 try{const u=new URL(v);if(u.protocol!=='https:'||u.port||u.username||u.password)return false;
 const h=u.hostname.toLowerCase();
 return h==='telegram.org'||h.endsWith('.telegram.org')||h==='telegram-cdn.org'||h.endsWith('.telegram-cdn.org')||h==='telesco.pe'||h.endsWith('.telesco.pe')||h==='telegra.ph'||h.endsWith('.telegra.ph');
 }catch{return false}
}
async function telegramProfile(handle){
 const page=await limited('https://t.me/'+encodeURIComponent(handle),'text/html');
 const txt=await page.text();
 const tag=(txt.match(/<meta\s+[^>]*property=["']og:image["'][^>]*>/i)||txt.match(/<meta\s+[^>]*content=["'][^"']+["'][^>]*property=["']og:image["'][^>]*>/i)||[])[0]||'';
 const raw=(tag.match(/content=["']([^"']+)["']/i)||[])[1]||'';
 const decoded=raw.replace(/&amp;/g,'&');
 if(!validImageURL(decoded))throw Error('no trusted Telegram profile icon');
 return decoded;
}
module.exports=async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end()}
 const input=String(req.query.url||'');
 if(input.length<10||input.length>1700)return res.status(400).end();
 let u;try{u=new URL(input)}catch{return res.status(400).end()}
 if(u.protocol!=='https:'||u.port||u.username||u.password||!u.hostname.includes('.'))return res.status(400).end();
 const host=u.hostname.toLowerCase();
 if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(host))return res.status(400).end();
 let target;
 try{
  if(host==='t.me'||host==='telegram.me'){
    const parts=u.pathname.split('/').filter(Boolean);
    const handle=parts[0]==='s'?parts[1]:parts[0];
    if(!handle||!/^[a-zA-Z0-9_]{5,32}$/.test(handle)||['joinchat','share','addstickers','c','iv','proxy'].includes(handle))return res.status(404).end();
    target=await telegramProfile(handle);
  }else{
    target='https://www.google.com/s2/favicons?domain='+encodeURIComponent(host)+'&sz=128';
  }
  const resp=await limited(target);
  const mime=(resp.headers.get('content-type')||'').split(';')[0].trim();
  if(!['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].includes(mime))throw Error('not a safe raster image');
  const declared=Number(resp.headers.get('content-length')||0);
  if(declared>MAX_IMAGE)throw Error('image too big');
  const buf=Buffer.from(await resp.arrayBuffer());
  if(buf.length<100||buf.length>MAX_IMAGE)throw Error('bad image size');
  res.setHeader('Content-Type',mime);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public,max-age=3600,s-maxage=86400,stale-while-revalidate=86400');
  return res.status(200).end(buf);
 }catch(e){return res.status(404).end()}
};
