'use strict';
const {normalize,identity,publishDecision,mergeDestinations}=require('./media-contract.cjs');
/**
 * Staged production boundary. The supplied store must implement atomic per-article
 * transactions; an in-process Map is insufficient for Vercel production workers.
 * Services are explicit adapters (not 100 fictitious routes).
 */
async function handoff(raw,{store,recover,website,telegram,validate,allowPhotoFallback=true}={}){
 if(!store?.transaction||!recover?.length||!website?.publish||!telegram?.publish||!validate)
  throw Error('DURABLE_STORE_AND_ADAPTERS_REQUIRED');
 const story=normalize(raw),key=identity(story);
 return store.transaction(key,async (state={},save)=>{
  if(state.kind && state.kind!==story.mediaKind)throw Error('MEDIA_KIND_CONFLICT');
  state.kind=story.mediaKind;
  state.attempts=state.attempts||{};
  state.destinations=state.destinations||{};
  const persist=async()=>save(state);
  if(!state.media){
   if(story.mediaKind==='text')state.media={kind:'text'};
   else {
    for(const adapter of recover){
     if(!adapter.id||typeof adapter.run!=='function')throw Error('INVALID_ADAPTER');
     if(state.attempts[adapter.id]?.status==='exhausted')continue;
     try {
      const candidate=await adapter.run(story);
      if(candidate && candidate.kind===story.mediaKind && await validate(candidate,story)){
       state.media=candidate;
       state.attempts[adapter.id]={status:'success'};
       await persist();break;
      }
      state.attempts[adapter.id]={status:'exhausted'};
     }catch(e){
      state.attempts[adapter.id]={status:e.permanent?'exhausted':'retry',reason:String(e.message||e).slice(0,100)};
     }
     await persist();
    }
    if(!state.media && story.mediaKind==='video' && allowPhotoFallback){
      const exhausted=recover.every(a=>state.attempts[a.id]?.status==='exhausted');
      if(exhausted){
       const original=story.media.find(m=>m.kind==='photo'&&m.isOriginal===true);
       if(original && await validate(original,story))state.media=original;
      }
    }
   }
   await persist();
  }
  const decision=publishDecision(story,{videoVerified:state.media?.kind==='video',photoVerified:state.media?.kind==='photo',recoveryExhausted:recover.every(a=>state.attempts[a.id]?.status==='exhausted'),hasPendingRetries:recover.some(a=>state.attempts[a.id]?.status==='retry')});
  if(decision.status==='awaiting-video'||decision.status==='awaiting-photo'||decision.status==='awaiting-album-validation')
    return {ok:false,stage:'awaiting-media',key};
  for(const [dest,client] of [['website',website],['telegram',telegram]]){
   if(state.destinations[dest]?.status==='sent')continue;
   try{
    const outcome=await client.publish(story,state.media,{idempotencyKey:key+':'+dest});
    if(!outcome?.ok||!outcome.externalId)throw Error('UNCONFIRMED_'+dest);
    state.destinations=mergeDestinations(state.destinations,{[dest]:{status:'sent',externalId:String(outcome.externalId)}});
   }catch(e){state.destinations=mergeDestinations(state.destinations,{[dest]:{status:'retry',reason:String(e.message||e).slice(0,100)}});}
   await persist();
  }
  const ok=['website','telegram'].every(k=>state.destinations[k]?.status==='sent');
  return {ok,stage:ok?'complete':'partially-published',key,mediaKind:state.media.kind,destinations:state.destinations};
 });
}
module.exports={handoff};
