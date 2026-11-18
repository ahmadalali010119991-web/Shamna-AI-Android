'use strict';
const {createBrandedTelegram}=require('./branded-telegram.cjs');
async function runTests(assert,controllerFactory){
 const story={id:'42',mediaKind:'text',title:'عنوان',summary:'النص الكامل',sourceUrl:'https://example.com/news'};
 const options={idempotencyKey:'42:telegram'};
 const original={kind:'text'};
 const photo={kind:'photo',articleId:'42',originalKind:'text',verified:true,uri:'https://example.com/card.png'};
 let calls=[],preps=0,sendError=false;
 const pub={publish:async(...a)=>{calls.push(a);if(sendError)throw Error('UNCERTAIN');return {ok:true,externalId:'3'}}};
 const base={publisher:pub,controllerFactory,prepare:async()=>{preps++;return photo},verify:async()=>true};
 async function check(config,s,m,expected){calls=[];await createBrandedTelegram({...base,...config}).publish(s,m,options);assert(calls.length===1,'one send');assert(calls[0][0]===s&&calls[0][1]===expected&&calls[0][2]===options,'preserve arguments');}
 await check({},story,original,original);assert(preps===0,'off by default');
 await check({flags:{text:true}},story,original,photo);
 await check({flags:{text:true},prepare:async()=>({...photo,articleId:'43'})},story,original,original);
 await check({flags:{text:true},verify:async()=>false},story,original,original);
 await check({flags:{text:true},prepare:async()=>{throw Error('render failure')}},story,original,original);
 await check({flags:{text:true},prepare:()=>new Promise(()=>{}),budgetMs:5},story,original,original);
 const v={kind:'video',verified:true,fileId:'original-video'};
 const vs={...story,mediaKind:'video'};
 await check({flags:{video:true},prepare:async()=>photo},vs,v,v);
 const brandedV={kind:'video',articleId:'42',originalKind:'video',verified:true,fileId:'brand-video'};
 await check({flags:{video:true},prepare:async()=>brandedV},vs,v,brandedV);
 const fallback={kind:'photo',verified:true,fileId:'old-photo'};
 await check({flags:{photo:true},prepare:async()=>({...photo,originalKind:'photo'})},vs,fallback,fallback);
 const brandedP={...photo,originalKind:'photo'};
 await check({flags:{photo:true},prepare:async()=>brandedP},{...story,mediaKind:'photo'},fallback,brandedP);
 const album={kind:'album',verified:true};await check({flags:{photo:true,video:true,text:true}},{...story,mediaKind:'album'},album,album);
 calls=[];sendError=true;let failed=false;try{await createBrandedTelegram({...base,flags:{text:true}}).publish(story,original,options)}catch(e){failed=e.message==='UNCERTAIN'}assert(failed&&calls.length===1,'no duplicate after ambiguous send');
 return 12;
}
module.exports={runTests};

if(require.main===module){runTests((ok,msg)=>{if(!ok)throw Error(msg)},()=>new AbortController()).then(n=>console.log(n+' scenarios passed')).catch(e=>{console.error(e);process.exitCode=1})}
