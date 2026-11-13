'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
let stateValue=null,editCalls=0,forwardCalls=0,deleted=0;
const state={
 async read(key){assert.equal(key,'midan_media_video_retries_v4');return stateValue?{value:JSON.parse(JSON.stringify(stateValue))}:null},
 async write(key,value){assert.equal(key,'midan_media_video_retries_v4');stateValue=JSON.parse(JSON.stringify(value));return {ok:true}}
};
const blob={async list(){return {blobs:[]}},async put(){throw Error('Vercel Blob: This store has been suspended.')}};
const orig=Module._load;Module._load=function(name,parent,main){
 if(name==='@vercel/blob')return blob;
 if(name==='./state-v3')return state;
 return orig.apply(this,arguments)
};
process.env.TELEGRAM_BOT_TOKEN='999:mock';
process.env.BLOB_READ_WRITE_TOKEN='mock';
function reply(val){return new Response(JSON.stringify(val),{status:200,headers:{'Content-Type':'application/json'}})}
async function native(url,init){
 const u=String(url);
 if(u.includes('t.me/s/maydan_alkhabar'))return new Response('<div data-post="maydan_alkhabar/552"><img src="pic"></div>',{status:200});
 if(u.includes('t.me/s/suhebb0'))return new Response('<div data-post="suhebb0/47987"><div class="tgme_widget_message_video_player">4:56</div></div>',{status:200});
 const action=u.split('/').pop();
 if(action==='forwardMessage'){forwardCalls++;return reply({ok:true,result:{message_id:881,video:{file_id:'SOURCE_VIDEO'}}})}
 if(action==='deleteMessage'){deleted++;return reply({ok:true,result:true})}
 if(action==='editMessageMedia'){editCalls++;return reply({ok:true,result:{message_id:552,video:{file_id:'SOURCE_VIDEO'}}})}
 throw Error('Unexpected route '+u)
}
(async()=>{
 const m=require('./video-resilience-v4.js');
 const first=await m.retryPending(native);
 assert.equal(first.backend,'supabase');
 assert.equal(first.seedStatus,'queued');
 assert.equal(first.scanned,1);
 assert.equal(first.success,1);
 assert.equal(first.done552,true);
 assert.equal(stateValue.done552,true);
 assert.equal(stateValue.schema,4);
 assert.equal(editCalls,1);
 assert(deleted>=1);
 console.log('PASS blob suspended -> secure Supabase state fallback; incident 552 source video edit, temp cleanup, state persisted');
 const second=await m.retryPending(native);
 assert.equal(second.backend,'supabase');
 assert.equal(second.scanned,0);
 assert.equal(second.done552,true);
 assert.equal(editCalls,1);
 console.log('PASS verified idempotency; no extra edit when incident already repaired');
 console.log('TOTAL PASS: 2 fallback checks')
})().catch(e=>{console.error(e);process.exit(1)});
