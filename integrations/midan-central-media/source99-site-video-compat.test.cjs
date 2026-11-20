'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source99-site-video-'));
const shim=fs.readFileSync(path.join(__dirname,'source99-site-video-compat.cjs'),'utf8');
const legacy=[
 "'use strict';",
 "const SOURCE='https://t.me/s/Private_Source99';",
 "function candidateFromHtml(html,id){",
 " const block=String(html).split(/<div class=\"tgme_widget_message_wrap\\b/).slice(1).find(s=>s.includes('data-post=\"Private_Source99/'+id+'\"'));",
 " return block?.match(/src=\"(https:\\/\\/cdn4\\.telesco\\.pe\\/[^\\\"]+)\"/)?.[1]||null;",
 "}",
 "async function playable(url,fetcher=fetch){",
 " const controller=new AbortController();",
 " const timeout=setTimeout(()=>controller.abort(),8500);",
 " try{",
 "  const response=await fetcher(url,{method:'GET',redirect:'manual',headers:{Range:'bytes=0-31',Accept:'video/mp4'},signal:controller.signal});",
 "  if(response.status!==206||response.redirected)return false;",
 "  if((response.headers.get('content-type')||'').split(';')[0].toLowerCase()!=='video/mp4')return false;",
 "  const range=String(response.headers.get('content-range')||'').match(/^bytes 0-31\\/(\\d+)$/);",
 "  if(!range||Number(range[1])<32||Number(range[1])>45_000_000)return false;",
 "  if(!response.body?.getReader)return false;",
 "  const reader=response.body.getReader();",
 "  let prefix=new Uint8Array(32),position=0;",
 "  try{while(position<32){const {done,value}=await reader.read();if(done)break;const n=Math.min(32-position,value.length);prefix.set(value.subarray(0,n),position);position+=n}}",
 "  finally{await reader.cancel().catch(()=>{})}",
 "  return position===32&&String.fromCharCode(...prefix.subarray(4,8))==='ftyp';",
 " }finally{clearTimeout(timeout)}",
 "}",
 "async function resolve(id,{fetcher=fetch,loadSource}={}){",
 " const m=String(id||'').match(/^private-source99-([1-9]\\d{0,11})$/);",
 " if(!m)return null;",
 " const posts=await (loadSource||require('./private-source99').fetchSource)();",
 " const original=posts.find(p=>p.id===id);",
 " if(!original||original.hasOriginalVideo!==true)return null;",
 " const response=await fetcher(SOURCE,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});",
 " if(!response.ok||response.status!==200)return null;",
 " const html=(await response.text()).slice(0,2_000_000);",
 " const url=candidateFromHtml(html,m[1]);",
 " if(!url||!await playable(url,fetcher))return null;",
 " return {kind:'mp4',url,sourceUrl:original.sourceUrl};",
 "}",
 "module.exports={resolve,candidateFromHtml,playable};"
].join('\n');
const prefix=Uint8Array.from([0,0,0,32,102,116,121,112,...Array(24).fill(0)]);
const postUrl='https://t.me/Private_Source99/8';
const html='<div class="tgme_widget_message_wrap"><div data-post="Private_Source99/8"><video class="tgme_widget_message_video" src="https://cdn4.telesco.pe/video8.mp4"></video></div></div>';
const posts=[{id:'private-source99-8',sourceUrl:postUrl,hasOriginalVideo:true}];
function fake({videoMime='binary/octet-stream',status=206,content=prefix,postHtml=html}={}){
 return async url=>{
  if(url==='https://t.me/s/Private_Source99')return {ok:true,status:200,text:async()=>postHtml};
  return {status,redirected:false,headers:{get:k=>k==='content-type'?videoMime:k==='content-range'?'bytes 0-31/128':null},
   body:new ReadableStream({start(c){c.enqueue(content);c.close()}})};
 };
}
(async()=>{
 try{
  fs.writeFileSync(path.join(temp,'private-source99-video.js'),shim);
  fs.writeFileSync(path.join(temp,'private-source99-video-legacy.cjs'),legacy);
  const api=require(path.join(temp,'private-source99-video.js'));
  const loadSource=async()=>posts;
  const direct=await api.resolve('private-source99-8',{loadSource,fetcher:fake()});
  assert.equal(direct.kind,'mp4','generic CDN MIME accepted with valid ftyp');
  assert.equal(direct.url,'https://cdn4.telesco.pe/video8.mp4');
  const fallback=await api.resolve('private-source99-8',{loadSource,fetcher:fake({status:403})});
  assert.equal(fallback.kind,'embed','original public Telegram post is media fallback');
  assert.equal(fallback.url,postUrl+'?embed=1');
  assert.equal(fallback.sourceUrl,postUrl);
  const wrongSig=await api.resolve('private-source99-8',{loadSource,fetcher:fake({content:new Uint8Array(32)})});
  assert.equal(wrongSig.kind,'embed','invalid media must never be presented as playable MP4');
  const absent=await api.resolve('private-source99-8',{loadSource,fetcher:fake({postHtml:'<p>No source post</p>'})});
  assert.equal(absent,null,'do not invent a Telegram post');
  const unknown=await api.resolve('private-source99-8',{loadSource:async()=>[],fetcher:fake()});
  assert.equal(unknown,null,'cannot bypass source video proof');
  console.log('PASS: Source99 site MP4 bytes, alternate Telegram embed, canonical source, no fabricated posts');
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
