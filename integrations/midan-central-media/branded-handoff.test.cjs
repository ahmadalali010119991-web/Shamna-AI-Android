'use strict';
const {handoff}=require('./handoff-engine.cjs');
async function run(assert,controllerFactory){
 const calls=[],saved=[];
 const raw={id:'42',mediaKind:'text',title:'عنوان الخبر',summary:'النص الكامل للخبر',sourceUrl:'https://example.com/news'};
 const prepared={kind:'photo',articleId:'42',originalKind:'text',verified:true,uri:'https://example.com/card.png'};
 const store={transaction:async(key,fn)=>fn({},async state=>{saved.push(JSON.parse(JSON.stringify(state)))})};
 const client=dest=>({publish:async(story,media,opts)=>{calls.push({dest,story,media,opts});return {ok:true,externalId:dest+'-42'}}});
 const result=await handoff(raw,{store,website:client('site'),telegram:client('telegram'),validate:async()=>true,
 branding:{flags:{text:true},prepare:async()=>prepared,verify:async()=>true,controllerFactory}});
 assert(result.ok===true,'both receipts');
 assert(calls.length===2,'exactly two destination calls');
 assert(calls[0].dest==='site'&&calls[0].media.kind==='text','site retains original');
 assert(calls[1].dest==='telegram'&&calls[1].media===prepared,'telegram branding only');
 assert(calls[0].story.summary===raw.summary&&calls[1].story.summary===raw.summary,'complete text preserved at adapter boundary');
 assert(calls[0].opts.idempotencyKey.endsWith(':website')&&calls[1].opts.idempotencyKey.endsWith(':telegram'),'distinct stable idempotency keys');
 assert(saved.every(s=>!s.media||s.media.kind==='text'),'original stays in durable state');
 return 7;
}
module.exports={run};
if(require.main===module){run((ok,m)=>{if(!ok)throw Error(m)},()=>new AbortController()).then(n=>console.log(n+' integration assertions passed')).catch(e=>{console.error(e);process.exitCode=1})}
