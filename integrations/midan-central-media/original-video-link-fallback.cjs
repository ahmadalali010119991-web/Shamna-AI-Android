'use strict';
/**
 * A truthful fallback when Telegram public source displays "Media is too big".
 * Does NOT claim a native video was uploaded. Edits only the ORIGINAL message markup.
 */
const EXPECTED_DESTINATION='@maydan_alkhabar';
const LABEL='🎬 شاهد الفيديو الأصلي';
function validatedSource(job){
 if(!job||job.destination!==EXPECTED_DESTINATION||!Number.isSafeInteger(Number(job.targetMessageId))||Number(job.targetMessageId)<1)return null;
 if(!/^[A-Za-z0-9_]{5,32}$/.test(String(job.channel||'')))return null;
 if(!Number.isSafeInteger(Number(job.sourceId))||Number(job.sourceId)<1)return null;
 const expected='https://t.me/'+job.channel+'/'+job.sourceId;
 return job.source===expected?expected:null;
}
async function originalTooBig(job,fetcher){
 const url=validatedSource(job);
 if(!url)return false;
 const endpoint='https://t.me/s/'+job.channel+'?before='+(Number(job.sourceId)+1);
 const res=await fetcher(endpoint,{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(12000)});
 if(!res.ok)return false;
 const html=(await res.text()).slice(0,1800000);
 const marker='data-post="'+job.channel+'/'+job.sourceId+'"';
 const start=html.indexOf(marker);
 if(start<0)return false;
 const next=html.indexOf('data-post="',start+marker.length);
 const block=html.slice(start,next>start?next:start+40000);
 return block.includes('Media is too big')&&block.includes('VIEW IN TELEGRAM');
}
async function linkOriginal(job,{fetcher=globalThis.fetch,botToken}={}){
 const source=validatedSource(job);
 if(!source||typeof botToken!=='string'||botToken.length<10)throw Error('INVALID_LINK_FALLBACK_CONTEXT');
 if(!(await originalTooBig(job,fetcher)))return {linked:false,reason:'source_not_confirmed_too_large'};
 const current=job.reply_markup?.inline_keyboard;
 const rows=Array.isArray(current)?JSON.parse(JSON.stringify(current)):[];
 if(!rows.some(row=>Array.isArray(row)&&row.some(b=>b?.url===source&&String(b?.text||'').includes('الفيديو')))){
  rows.unshift([{text:LABEL,url:source}]);
 }
 const payload={chat_id:EXPECTED_DESTINATION,message_id:Number(job.targetMessageId),reply_markup:{inline_keyboard:rows}};
 const res=await fetcher('https://api.telegram.org/bot'+botToken+'/editMessageReplyMarkup',
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(17000)});
 const packet=await res.json().catch(()=>null);
 if(!res.ok||packet?.ok!==true||packet?.result?.message_id!==Number(job.targetMessageId)){
  return {linked:false,reason:'telegram_markup_edit_not_confirmed'};
 }
 return {linked:true,source,messageId:Number(job.targetMessageId),mode:'original_source_link_only'};
}
module.exports={linkOriginal,originalTooBig,validatedSource};
