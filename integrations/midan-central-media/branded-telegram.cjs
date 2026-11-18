'use strict';
// Staged, opt-in Telegram-only media preparation. Never wraps website publishing.
function createBrandedTelegram({publisher,prepare,verify,flags={},budgetMs=1200,controllerFactory=()=>new AbortController(),report=()=>{}}={}){
 if(typeof publisher?.publish!=='function')throw Error('PUBLISHER_REQUIRED');
 if(!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>5000)throw Error('INVALID_BRANDING_BUDGET');
 const allowed={text:flags.text===true,photo:flags.photo===true,video:flags.video===true};
 function note(code){try{report(code)}catch{}}
 async function publish(story,original,options){
  const kind=original?.kind||'text';
  // In particular, an original video awaiting recovery must never become a generated card.
  const eligible=allowed[kind]===true&&story?.mediaKind===kind&&
   !!story.id&&!!options?.idempotencyKey&&(kind==='text'||original?.verified===true);
  if(!eligible||typeof prepare!=='function'||typeof verify!=='function')
   return publisher.publish(story,original,options);
  let candidate=null, timer, controller;
  try{
   controller=controllerFactory();
   const work=Promise.resolve().then(async()=>{
    const item=await prepare({story,original,signal:controller.signal,idempotencyKey:options.idempotencyKey});
    const expected=kind==='video'?'video':'photo';
    if(!item||item.kind!==expected||item.articleId!==String(story.id)||item.originalKind!==kind||item.verified!==true||!(item.fileId||item.uri))
      throw Error('BRANDING_INVALID_MEDIA');
    if(await verify(item,{story,original,signal:controller.signal})!==true)throw Error('BRANDING_VERIFICATION_FAILED');
    return item;
   });
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(Error('BRANDING_DEADLINE'));controller.abort()},budgetMs)});
   candidate=await Promise.race([work,deadline]);
   note('BRANDING_READY');
  }catch{note('BRANDING_FALLBACK_ORIGINAL');}
  finally{clearTimeout(timer);}
  // Exactly one invocation, with the unchanged story and idempotency key.
  // Never catch an ambiguous Telegram send and retry with a second message.
  return publisher.publish(story,candidate||original,options);
 }
 return {publish};
}
module.exports={createBrandedTelegram};
