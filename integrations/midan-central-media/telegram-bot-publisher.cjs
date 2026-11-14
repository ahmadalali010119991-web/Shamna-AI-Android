'use strict';
/**
 * Real Telegram Bot API adapter (staged). An API timeout is ambiguous.
 * Backend ledger MUST prevent resending an uncertain attempt blindly.
 */
function escapeHtml(s) {
 return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function safeMediaRef(value) {
 const s=String(value||'');
 if(/^[A-Za-z0-9_-]{20,500}$/.test(s))return s;
 try {
  const u=new URL(s);
  if(u.protocol!=='https:'||u.username||u.password||u.port||
    !u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(u.hostname)||
    /(?:^|\.)internal$|(?:^|\.)local$/.test(u.hostname))throw Error('UNTRUSTED_MEDIA_URL');
  return u.href;
 }catch{throw Error('UNTRUSTED_MEDIA_REFERENCE');}
}
function createTelegramPublisher({botToken,chatId,ledger,fetcher=globalThis.fetch,timeoutMs=25000}={}) {
 if(typeof botToken!=='string'||!botToken.trim()||!chatId||typeof fetcher!=='function')
  throw Error('TELEGRAM_BACKEND_CONFIG_REQUIRED');
 if(!ledger||typeof ledger.reserve!=='function'||typeof ledger.markSent!=='function'||
    typeof ledger.markUncertain!=='function')throw Error('DURABLE_TELEGRAM_LEDGER_REQUIRED');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('INVALID_TIMEOUT');
 const endpoint='https://api.telegram.org/bot'+botToken+'/';
 async function publish(story,media,{idempotencyKey}={}) {
  if(!idempotencyKey||typeof idempotencyKey!=='string')throw Error('IDEMPOTENCY_KEY_REQUIRED');
  const kind=media?.kind||'text';
  if(!['text','photo','video'].includes(kind))throw Error('UNSUPPORTED_MEDIA_KIND');
  if(kind!=='text'&&media?.verified!==true)throw Error('MEDIA_NOT_VERIFIED');
  const claim=await ledger.reserve(idempotencyKey);
  if(claim?.status==='sent'&&claim.externalId)return {ok:true,externalId:String(claim.externalId),deduplicated:true};
  if(claim?.status!=='claimed')throw Error('TELEGRAM_DELIVERY_NOT_RECONCILED');
  const source=String(story.sourceUrl||'');
  const title=escapeHtml(story.title||'');
  const full=title+'\n\n<a href="'+escapeHtml(source)+'">المصدر الأصلي</a>';
  const caption=full.length>1024?escapeHtml(story.title||'').slice(0,900)+'\nالمصدر: '+escapeHtml(source).slice(0,80):full;
  const text=full.slice(0,4096);
  let method,payload={chat_id:chatId,parse_mode:'HTML',disable_notification:false};
  if(kind==='video'){
   method='sendVideo';payload.video=safeMediaRef(media.fileId||media.uri);
   payload.caption=caption;payload.supports_streaming=true;
  }else if(kind==='photo'){
   method='sendPhoto';payload.photo=safeMediaRef(media.fileId||media.uri);
   payload.caption=caption;
  }else{
   method='sendMessage';payload.text=text;payload.disable_web_page_preview=true;
  }
  let submitted=false;
  try {
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),timeoutMs);
   let response;
   try {
    submitted=true;
    response=await fetcher(endpoint+method,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(payload),signal:controller.signal
    });
   }finally{clearTimeout(timer);}
   const data=await response.json();
   if(response.ok&&data?.ok===true&&data?.result?.message_id){
    const externalId=String(data.result.message_id);
    await ledger.markSent(idempotencyKey,externalId);
    return {ok:true,externalId};
   }
   throw Error('TELEGRAM_RESPONSE_UNCONFIRMED_'+(response.status||'unknown'));
  }catch(e){
   if(submitted)await ledger.markUncertain(idempotencyKey,String(e?.message||e).slice(0,160));
   throw e;
  }
 }
 return {publish};
}
module.exports={createTelegramPublisher,safeMediaRef,escapeHtml};
