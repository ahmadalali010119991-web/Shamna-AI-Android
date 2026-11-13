'use strict';
const {normalize,identity,publishDecision,mergeDestinations}=require('./media-contract.cjs');
/**
 * Staged integration — not wired to production.
 * store.transaction() MUST serialize each article and persist save() durably.
 * Telegram/site adapters MUST reconcile their idempotencyKey against previously
 * completed sends after ambiguous timeouts; Telegram Bot API alone does not
 * provide an atomic idempotency guarantee.
 */
async function handoff(raw,{store,recover=[],website,telegram,validate,checkExternal,allowPhotoFallback=true}={}){
 if(typeof store?.transaction!=='function'||!website?.publish||!telegram?.publish||typeof validate!=='function')
  throw Error('DURABLE_STORE_AND_ADAPTERS_REQUIRED');
 const story=normalize(raw),key=identity(story);
 const routeIds=new Set();
 for(const adapter of recover){
  if(!adapter?.id||typeof adapter.run!=='function'||routeIds.has(adapter.id))throw Error('INVALID_OR_DUPLICATE_ADAPTER');
  routeIds.add(adapter.id);
 }
 if(story.mediaKind!=='text' && recover.length===0)throw Error('NO_MEDIA_RECOVERY_ADAPTERS');
 return store.transaction(key,async (state={},save,assertLease=async()=>{})=>{
  if(state.kind && state.kind!==story.mediaKind)throw Error('MEDIA_KIND_CONFLICT');
  state.kind=story.mediaKind;
  state.attempts=state.attempts||{};
  state.destinations=state.destinations||{};
  const persist=async()=>save(state);
  if(!state.media){
   if(story.mediaKind==='text')state.media={kind:'text'};
   else {
    for(const adapter of recover){
     if(state.attempts[adapter.id]?.status==='exhausted')continue;
     try {
      await assertLease();
      const candidate=await adapter.run(story);
      if(candidate && candidate.kind===story.mediaKind && await validate(candidate,story)){
       state.media=candidate;
       state.attempts[adapter.id]={status:'success'};
       await persist();break;
      }
      // Empty/invalid responses often reflect temporary extraction failures.
      // Never exhaust a route without explicit proof that it cannot recover.
      state.attempts[adapter.id]={status:'retry',reason:'NO_VERIFIED_MEDIA'};
     }catch(e){
      if(e?.message==='ARTICLE_LEASE_LOST')throw e;
      state.attempts[adapter.id]={status:e?.permanent===true?'exhausted':'retry',
       reason:String(e?.message||e).slice(0,100)};
     }
     await persist();
    }
    if(!state.media && story.mediaKind==='video' && allowPhotoFallback){
      const exhausted=recover.length>0&&recover.every(a=>state.attempts[a.id]?.status==='exhausted');
      if(exhausted){
       const original=story.media.find(m=>m.kind==='photo'&&m.isOriginal===true);
       if(original && await validate(original,story))state.media=original;
      }
    }
   }
   await persist();
  }
  const recoveryExhausted=recover.length>0&&recover.every(a=>state.attempts[a.id]?.status==='exhausted');
  const hasPendingRetries=recover.some(a=>state.attempts[a.id]?.status==='retry');
  const decision=publishDecision(story,{videoVerified:state.media?.kind==='video',
   photoVerified:state.media?.kind==='photo',recoveryExhausted,hasPendingRetries});
  if(decision.status.startsWith('awaiting-'))
    return {ok:false,stage:'awaiting-media',key,attempts:state.attempts};
  for(const [dest,client] of [['website',website],['telegram',telegram]]){
   if(state.destinations[dest]?.status==='sent')continue;
   if(state.media?.durability==='source-dependent'){
    try{
     if(typeof checkExternal!=='function')throw Error('EXTERNAL_MEDIA_RECHECK_REQUIRED');
     await assertLease();
     const fresh=await checkExternal(state.media,story,dest);
     if(!fresh||fresh.publiclyPlayable!==true||fresh.uri!==state.media.uri ||
       fresh.sha256!==state.media.sha256)throw Error('EXTERNAL_MEDIA_NO_LONGER_PLAYABLE');
    }catch(e){
     if(e?.message==='ARTICLE_LEASE_LOST')throw e;
     state.attempts['external-playback']={status:'retry',reason:String(e?.message||e).slice(0,100)};
     // Only re-run discovery if no destination already uses the old URL.
     // If one destination is live, hold for coordinated replacement.
     if(!Object.values(state.destinations).some(x=>x?.status==='sent'))state.media=null;
     await persist();
     return {ok:false,stage:'awaiting-media',key,attempts:state.attempts,
       destinations:state.destinations};
    }
   }
   try{
    await assertLease();
    const outcome=await client.publish(story,state.media,{idempotencyKey:key+':'+dest});
    if(!outcome?.ok||!outcome.externalId)throw Error('UNCONFIRMED_'+dest);
    state.destinations=mergeDestinations(state.destinations,{[dest]:{status:'sent',externalId:String(outcome.externalId)}});
   }catch(e){
    if(e?.message==='ARTICLE_LEASE_LOST')throw e;
    state.destinations=mergeDestinations(state.destinations,{[dest]:{status:'retry',reason:String(e?.message||e).slice(0,100)}});
   }
   await persist();
  }
  const ok=['website','telegram'].every(k=>state.destinations[k]?.status==='sent');
  return {ok,stage:ok?'complete':'partially-published',key,mediaKind:state.media.kind,destinations:state.destinations};
 });
}
module.exports={handoff};
