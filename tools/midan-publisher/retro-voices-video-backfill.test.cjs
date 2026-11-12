'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('./retro-voices-video-backfill.cjs');
const res=()=>({statusCode:null,setHeader(){},status(code){this.statusCode=code;return this},json(x){this.body=x;return x}});
test('manifest targets exactly two source-verified historical posts',()=>{
 assert.deepEqual(handler.CHANGES.map(x=>x.target),[487,491]);
 assert.deepEqual(handler.CHANGES.map(x=>x.from),[47965,47969]);
 assert.ok(handler.CHANGES.every(x=>handler.caption(x).value.length<1024));
});
test('public source MP4s are attached to existing Telegram messages without forwarding or storage',async()=>{
 const native=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='MOCK';const sent=[],fake=Buffer.alloc(3200);fake.write('ftypisom',4,'ascii');
 globalThis.fetch=async(input,init={})=>{
  const u=String(input),body=init.body;
  if(u.includes('t.me/s/maydan_alkhabar'))
   return new Response('<div data-post="maydan_alkhabar/487">أجبرت الشبيبة</div><div class="tgme_widget_message_wrap"></div><div data-post="maydan_alkhabar/491">حسب ماوردني من أحد الأشخاص</div>');
  if(u.includes('t.me/s/suhebb0'))
   return new Response('<div data-post="suhebb0/47965"><div class="tgme_widget_message_video"><video src="https://cdn4.telesco.pe/file/test-47965.mp4"></video></div></div><div class="tgme_widget_message_wrap"></div><div data-post="suhebb0/47969"><div class="tgme_widget_message_video"><video src="https://cdn4.telesco.pe/file/test-47969.mp4"></video></div></div>');
  if(u.includes('cdn4.telesco.pe'))return new Response(fake,{headers:{'content-type':'video/mp4','content-length':String(fake.length)}});
  const method=u.split('/').pop();sent.push({method,body});
  let data=body instanceof FormData?Object.fromEntries(body.entries()):JSON.parse(body||'{}');
  let result=method==='getMe'?{id:123456}:method==='getChatMember'?{status:'administrator',can_edit_messages:true}:
   method==='editMessageMedia'?{message_id:Number(data.message_id),video:{file_id:'TEST_FILE'}}:true;
  return new Response(JSON.stringify({ok:true,result}),{headers:{'content-type':'application/json'}});
 };
 try{const r=res();await handler({body:{}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);assert.deepEqual(r.body.result.map(x=>x.messageId),[487,491]);
  assert.ok(r.body.result.every(x=>x.videoConfirmed));
  assert.equal(sent.filter(x=>x.method==='forwardMessage').length,0);
  assert.equal(sent.filter(x=>x.method==='deleteMessage').length,0);
  let edits=sent.filter(x=>x.method==='editMessageMedia');
  assert.equal(edits.length,2);for(const e of edits){
   assert.ok(e.body instanceof FormData);
   const media=JSON.parse(e.body.get('media'));assert.equal(media.type,'video');assert.equal(media.media,'attach://original_video');
   assert.ok(e.body.get('original_video') instanceof Blob);
  }
 }finally{globalThis.fetch=native;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
test('invalid or unavailable public MP4 cannot replace the original Telegram post',async()=>{
 const native=globalThis.fetch,token=process.env.TELEGRAM_BOT_TOKEN;
 process.env.TELEGRAM_BOT_TOKEN='MOCK';let edits=0;
 globalThis.fetch=async(input,init={})=>{
  const u=String(input),method=u.split('/').pop();
  if(u.includes('t.me/s/maydan_alkhabar'))return new Response('<div data-post="maydan_alkhabar/487">أجبرت الشبيبة</div><div class="tgme_widget_message_wrap"></div><div data-post="maydan_alkhabar/491">حسب ماوردني من أحد الأشخاص</div>');
  if(u.includes('t.me/s/suhebb0'))return new Response('<div data-post="suhebb0/47965"><div class="tgme_widget_message_video"><video src="https://localhost/private.mp4"></video></div></div><div class="tgme_widget_message_wrap"></div><div data-post="suhebb0/47969"><div class="tgme_widget_message_video"><video src="https://localhost/private.mp4"></video></div></div>');
  if(method==='editMessageMedia')edits++;
  let data=method==='getMe'?{id:123}:method==='getChatMember'?{status:'administrator',can_edit_messages:true}:true;
  return new Response(JSON.stringify({ok:true,result:data}),{headers:{'content-type':'application/json'}});
 };
 try{let r=res();await handler({body:{}},r);assert.equal(r.body.ok,false);assert.equal(edits,0);assert.ok(r.body.result.every(x=>x.status==='not_edited'))}
 finally{globalThis.fetch=native;if(token===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=token}
});
