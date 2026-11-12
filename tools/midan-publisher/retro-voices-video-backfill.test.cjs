'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('./retro-voices-video-backfill.cjs');
const res=()=>({statusCode:null,setHeader(){},status(code){this.statusCode=code;return this},json(x){this.body=x;return x}});
test('manifest targets exactly two source-verified historical posts',()=>{
 assert.deepEqual(handler.CHANGES.map(x=>x.target),[487,491]);
 assert.deepEqual(handler.CHANGES.map(x=>x.from),[47965,47969]);
 assert.ok(handler.CHANGES.every(x=>handler.caption(x).value.length<1024));
});
test('native source videos are attached to existing posts and temporary forwards removed',async()=>{
 const native=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='MOCK';const sent=[];
 globalThis.fetch=async(input,init={})=>{
  let url=String(input),body=init.body?JSON.parse(init.body):{};
  if(url.includes('t.me/s/maydan_alkhabar'))return new Response('<div data-post="maydan_alkhabar/487">أجبرت الشبيبة</div><div class="tgme_widget_message_wrap"></div><div data-post="maydan_alkhabar/491">حسب ماوردني من أحد الأشخاص</div>');
  if(url.includes('t.me/s/suhebb0'))return new Response('<div data-post="suhebb0/47965"><div class="tgme_widget_message_video"></div></div><div class="tgme_widget_message_wrap"></div><div data-post="suhebb0/47969"><div class="tgme_widget_message_video"></div></div>');
  let method=url.split('/').pop();sent.push({method,body});
  let result=method==='getMe'?{id:123456}:method==='getChatMember'?{status:'administrator',can_delete_messages:true}:
   method==='forwardMessage'?{message_id:body.message_id+10000,video:{file_id:'TEST_FILE_'+body.message_id}}:
   method==='editMessageMedia'?{message_id:body.message_id,video:{file_id:body.media.media}}:true;
  return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
 };
 try{
  let r=res();await handler({body:{}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);
  assert.deepEqual(r.body.result.map(x=>x.messageId),[487,491]);
  assert.ok(r.body.result.every(x=>x.videoConfirmed));
  assert.equal(sent.filter(x=>x.method==='forwardMessage').length,2);
  assert.equal(sent.filter(x=>x.method==='editMessageMedia').length,2);
  assert.equal(sent.filter(x=>x.method==='deleteMessage').length,2);
  assert.ok(sent.filter(x=>x.method==='editMessageMedia').every(x=>x.body.media.type==='video'));
 }finally{globalThis.fetch=native;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
test('protected or unforwardable source leaves original message untouched',async()=>{
 const native=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='MOCK';let edits=0;
 globalThis.fetch=async(input,init={})=>{
  let url=String(input),body=init.body?JSON.parse(init.body):{};
  if(url.includes('t.me/s/maydan_alkhabar'))return new Response('<div data-post="maydan_alkhabar/487">أجبرت الشبيبة</div><div class="tgme_widget_message_wrap"></div><div data-post="maydan_alkhabar/491">حسب ماوردني من أحد الأشخاص</div>');
  if(url.includes('t.me/s/suhebb0'))return new Response('<div data-post="suhebb0/47965"><div class="tgme_widget_message_video"></div></div><div class="tgme_widget_message_wrap"></div><div data-post="suhebb0/47969"><div class="tgme_widget_message_video"></div></div>');
  const method=url.split('/').pop();if(method==='editMessageMedia')edits++;
  let obj=method==='getMe'?{ok:true,result:{id:123}}:method==='getChatMember'?{ok:true,result:{status:'administrator',can_delete_messages:true}}:
    {ok:false,description:'protected content'};
  return new Response(JSON.stringify(obj),{status:obj.ok?200:400,headers:{'content-type':'application/json'}});
 };
 try{let r=res();await handler({body:{}},r);assert.equal(r.body.ok,false);assert.equal(edits,0);assert.ok(r.body.result.every(x=>x.status==='not_edited'))}
 finally{globalThis.fetch=native;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
