'use strict';
/**
 * Production-compatible voice-video-first.js retry ledger repair.
 * Original unmodified production module must be saved as
 * ./voice-video-first-legacy.cjs in the deployed package.
 * Keep all existing source-matching, media editing and retry behavior.
 */
const fs=require('node:fs'),Module=require('node:module');
const file=require.resolve('./voice-video-first-legacy.cjs');
let source=fs.readFileSync(file,'utf8');
function replaceOnce(from,to){
 if(source.split(from).length!==2)
  throw Error('MIDAN_RETRY_LEDGER_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 source=source.replace(from,to);
}
const fallback=[
 "async function saveMediaRetrySupabase(record){",
 " const state=require('./state-v3'),key=STATE_QUEUE_KEY;",
 " const id=record.channel+':'+record.sourceId+':'+record.targetMessageId;",
 " for(let retry=0;retry<5;retry++){",
 "  try{",
 "   const previous=await state.read(key);",
 "   const raw=previous?.value;",
 "   const data=raw&&raw.schema===4&&raw.jobs&&typeof raw.jobs==='object'&&!Array.isArray(raw.jobs)",
 "    ?{...raw,jobs:{...raw.jobs}}",
 "    :{schema:4,jobs:{},done552:false,createdAt:new Date().toISOString()};",
 "   if(data.jobs[id]||(record.channel==='suhebb0'&&record.targetMessageId===552&&data.done552))return true;",
 "   if(Object.keys(data.jobs).length>=250){",
 "    console.error('Midan media queue full; preserving original message');",
 "    return false;",
 "   }",
 "   data.jobs[id]=record;",
 "   data.updatedAt=new Date().toISOString();",
 "   const saved=await state.call('write',key,data,previous?{expected_updated_at:previous.updated_at}:{expected_updated_at:null});",
 "   if(!saved||saved.ok!==true)continue;",
 "   const checked=await state.read(key);",
 "   if(checked?.value?.jobs?.[id]||",
 "      checked?.value?.lastSuccess?.target===record.targetMessageId||",
 "      (record.channel==='suhebb0'&&record.targetMessageId===552&&checked?.value?.done552))",
 "    return true;",
 "  }catch(e){",
 "   if(retry===4)console.warn('Midan Supabase media queue unavailable:',String(e.message||e).slice(0,130));",
 "  }",
 " }",
 " return false;",
 "}"
].join('\n');
replaceOnce('async function recordPending(src,data,targetMessageId,reasons,extra={}){',
 fallback+'\nasync function recordPending(src,data,targetMessageId,reasons,extra={}){');
replaceOnce('if(!process.env.BLOB_READ_WRITE_TOKEN||!targetMessageId)return false;',
 'if(!targetMessageId)return false;');
replaceOnce('const blob=blobAPI();if(!blob)return false;',
 'const blob=blobAPI();');
replaceOnce("try{\n  await blob.put(RETRY_PREFIX+src.channel",
 "try{\n  if(!blob||!process.env.BLOB_READ_WRITE_TOKEN)throw Error('BLOB_UNAVAILABLE');\n  await blob.put(RETRY_PREFIX+src.channel");
replaceOnce("}catch(e){console.warn('Midan media retry ledger unavailable:',String(e.message||e).slice(0,100));return false}",
 "}catch(e){console.warn('Midan Blob retry unavailable; using Supabase:',String(e.message||e).slice(0,100));return saveMediaRetrySupabase(record)}");
const child=new Module(file,module);
child.filename=file;child.paths=module.paths;
child._compile(source,file);
module.exports=child.exports;
