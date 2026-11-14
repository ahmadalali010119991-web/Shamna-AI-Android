'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const {linkOriginal,originalTooBig}=require('./original-video-link-fallback.cjs');
const job={source:'https://t.me/suhebb0/48013',channel:'suhebb0',sourceId:48013,destination:'@maydan_alkhabar',targetMessageId:664,reply_markup:{inline_keyboard:[[{text:'Social',url:'https://example.org'}]]}};
test('identifies too-large source only when exact post marker matches',async()=>{
 const html='<div data-post="suhebb0/48012">Media is too big VIEW IN TELEGRAM</div><div data-post="suhebb0/48013">Media is too big VIEW IN TELEGRAM</div>';
 const fetcher=async()=>({ok:true,text:async()=>html});
 assert.equal(await originalTooBig(job,fetcher),true);
 assert.equal(await originalTooBig({...job,sourceId:48011,source:'https://t.me/suhebb0/48011'},fetcher),false);
});
test('edits only matching original message, retains social links and requires Telegram receipt',async()=>{
 const html='<div data-post="suhebb0/48013">Media is too big VIEW IN TELEGRAM</div>';
 let edits=0;
 const fetcher=async(u,opts)=>{
  if(u.includes('/editMessageReplyMarkup')){
   edits++;const body=JSON.parse(opts.body);
   assert.equal(body.message_id,664);assert.equal(body.chat_id,'@maydan_alkhabar');
   assert.equal(body.reply_markup.inline_keyboard[0][0].url,job.source);
   assert.equal(body.reply_markup.inline_keyboard[1][0].text,'Social');
   return {ok:true,json:async()=>({ok:true,result:{message_id:664}})};
  }
  return {ok:true,text:async()=>html};
 };
 const result=await linkOriginal(job,{fetcher,botToken:'test_token_value'});
 assert.equal(result.linked,true);assert.equal(edits,1);
});
test('will never edit when source mismatch or unverified Telegram receipt',async()=>{
 let edits=0;
 const fetcher=async u=>{
  if(u.includes('/editMessageReplyMarkup')){edits++;return {ok:true,json:async()=>({ok:true,result:{message_id:700}})}}
  return {ok:true,text:async()=>'<div data-post="suhebb0/48013">Media is too big VIEW IN TELEGRAM</div>'};
 };
 await assert.rejects(()=>linkOriginal({...job,source:'https://t.me/suhebb0/48012'},{fetcher,botToken:'test_token_value'}),/INVALID_LINK_FALLBACK_CONTEXT/);
 assert.equal(edits,0);
 const result=await linkOriginal(job,{fetcher,botToken:'test_token_value'});
 assert.equal(result.linked,false);assert.equal(edits,1);
});
