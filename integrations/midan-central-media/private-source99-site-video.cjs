'use strict';
/* Original Source99 video resolver used by the site's existing /api/news?videoFor path.
 * This is a portable source copy; production deployment is managed separately. */
const SOURCE='https://t.me/s/Private_Source99';
function candidateFromHtml(html,id){
 const block=String(html).split(/<div class="tgme_widget_message_wrap\b/).slice(1)
  .find(s=>new RegExp('data-post="Private_Source99/'+id+'"(?!\\d)').test(s));
 if(!block)return null;
 let media=null;
 for(const tag of block.match(/<[^>]{1,1200}>/g)||[]){
  if(/tgme_widget_message_video\b|<video\b|<source\b/i.test(tag)){
   media=tag.match(/\b(?:src|data-video|data-src)=["']([^"']+)["']/i)?.[1];
   if(media)break;
  }
 }
 if(!media)return null;
 try{
  const u=new URL(media.replace(/&amp;/gi,'&'),SOURCE);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
   !/^cdn\d+\.telesco\.pe$/i.test(u.hostname))return null;
  return u.href;
 }catch{return null}
}
async function playable(url,fetcher=fetch){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetcher(url,{method:'GET',redirect:'manual',
   headers:{Range:'bytes=0-31',Accept:'video/mp4'},signal:controller.signal});
  if(response.status!==206||response.redirected)return false;
  if((response.headers.get('content-type')||'').split(';')[0].toLowerCase()!=='video/mp4')return false;
  const range=String(response.headers.get('content-range')||'').match(/^bytes 0-31\/(\d+)$/);
  if(!range||Number(range[1])<32||Number(range[1])>45_000_000)return false;
  if(!response.body?.getReader)return false;
  const reader=response.body.getReader();
  let prefix=new Uint8Array(32),position=0;
  try{
   while(position<32){
    const {done,value}=await reader.read();
    if(done)break;
    const n=Math.min(32-position,value.length);
    prefix.set(value.subarray(0,n),position);position+=n;
   }
  }finally{await reader.cancel().catch(()=>{})}
  return position===32&&String.fromCharCode(...prefix.subarray(4,8))==='ftyp';
 }finally{clearTimeout(timeout)}
}
async function resolve(id,{fetcher=fetch,loadSource}={}){
 const m=String(id||'').match(/^private-source99-([1-9]\d{0,11})$/);
 if(!m)return null;
 const posts=await (loadSource||require('./private-source99').fetchSource)();
 const original=posts.find(p=>p.id===id);
 if(!original||original.hasOriginalVideo!==true)return null;
 const response=await fetcher(SOURCE,{method:'GET',redirect:'manual',
  signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
 if(!response.ok||response.status!==200)return null;
 const html=(await response.text()).slice(0,2_000_000);
 const url=candidateFromHtml(html,m[1]);
 if(!url||!await playable(url,fetcher))return null;
 return {kind:'mp4',url,sourceUrl:original.sourceUrl};
}
module.exports={resolve,candidateFromHtml,playable};
