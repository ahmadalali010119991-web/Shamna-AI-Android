'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'midan-video-ephemeral-'));
const shim=fs.readFileSync(path.join(__dirname,'article-video-ephemeral-compat.cjs'),'utf8');
const source=[
 "'use strict';",
 "const CACHE=new Map();",
 "async function resolve(id){",
 " const source='https://www.france24.com/ar/video/story';",
 " const cached=CACHE.get(source);if(cached&&Date.now()-cached.time<1800000)return cached.value;",
 " try{",
 "  const page=await Promise.resolve({html:'fixture',url:source}),video=null;",
 "  const value=video?{ok:true,...video,source}:{ok:false,reason:'no_embeddable_video'};",
 "  if(CACHE.size>120)CACHE.clear();CACHE.set(source,{time:Date.now(),value});return value;",
 " }catch(e){return {ok:false,reason:'source_unavailable'}}",
 "}",
 "module.exports=async(req,res)=>{const value=await resolve(req.query.id);return res.status(200).json(value)};"
].join('\n');
(async()=>{
 try{
  fs.writeFileSync(path.join(dir,'article-video.js'),shim);
  fs.writeFileSync(path.join(dir,'article-video-legacy.cjs'),source);
  fs.writeFileSync(path.join(dir,'telegram-native-video-site-fallback.js'),
   "module.exports={resolve:async()=>({kind:'embed',url:'https://t.me/maydan_alkhabar/708?embed=1',transport:'telegram_channel'})}");
  const handler=require(path.join(dir,'article-video.js'));
  let json;
  await handler({query:{id:'demo'}},{status(n){assert.equal(n,200);return this},json(v){json=v;return v}});
  assert.equal(json.ok,true);
  assert.equal(json.kind,'embed');
  assert.equal(json.transport,'telegram_channel');
  assert.equal(json.source,'https://www.france24.com/ar/video/story');
  fs.writeFileSync(path.join(dir,'bad.js'),shim);
  fs.writeFileSync(path.join(dir,'article-video-legacy.cjs'),"'use strict';module.exports=()=>({ok:false});");
  assert.throws(()=>require(path.join(dir,'bad.js')),/PATCH_ANCHOR/);
  console.log('PASS: original video handler kept, ephemeral Telegram embed fallback and fail-closed upstream checks');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
