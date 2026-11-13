'use strict';
const assert=require('node:assert/strict');
const {normalizeSource99Article,admitSource99Article}=require('./private-source99-adapter.cjs');
const base={
 id:'private-source99-6',sourceId:'private-source99',
 sourceUrl:'https://t.me/Private_Source99/6',
 originalPostUrl:'https://t.me/Private_Source99/6',
 title:'',summary:'#القامشلي\nوصول المتظاهرين الى مخفر أبو قصايب جنوب القامشلي',
 editorialApproved:false,hasOriginalVideo:false,hasOriginalPhoto:true,
 importanceScore:0,country:'',province:'',category:'community'
};
(async()=>{
 const article=normalizeSource99Article(base);
 assert.ok(article.article.title.includes('وصول المتظاهرين'));
 assert.equal(article.article.mediaKind,'photo');
 assert.equal(article.approved,true,'trusted private-source feed bypasses editorial review');
 assert.equal(article.approvalRequired,false);
 assert.equal(article.bypassEditorialGates,true);
 assert.equal(article.mediaPending,true,'unavailable original image remains pending for technical recovery');
 assert.equal(article.article.sourceUrl,base.sourceUrl);
 const unique=await admitSource99Article(base,{exists:async url=>false});
 assert.equal(unique.shouldPublish,true);
 assert.equal(unique.duplicate,false);
 const old=await admitSource99Article(base,{exists:async url=>url===base.sourceUrl});
 assert.equal(old.shouldPublish,false);
 assert.equal(old.duplicate,true);
 const video=normalizeSource99Article({...base,id:'private-source99-7',
  sourceUrl:'https://t.me/Private_Source99/7',originalPostUrl:'https://t.me/Private_Source99/7',
  hasOriginalVideo:true,hasOriginalPhoto:true,editorialApproved:false});
 assert.equal(video.article.mediaKind,'video');
 assert.equal(video.approved,true);
 const empty=normalizeSource99Article({...base,summary:'#القامشلي',title:''});
 assert.ok(empty.article.title,'empty text cannot trigger editorial hold');
 await assert.rejects(()=>admitSource99Article(base),/DURABLE_DUPLICATE_CHECK_REQUIRED/);
 await assert.rejects(()=>admitSource99Article(base,{exists:async()=>undefined}),/DUPLICATE_CHECK_UNCONFIRMED/);
 assert.throws(()=>normalizeSource99Article({...base,sourceId:'other'}),/AUTHORIZED/);
 assert.throws(()=>normalizeSource99Article({...base,sourceUrl:'https://t.me/untrusted/6'}),/PROVENANCE/);
 console.log('PASS: Source99 dedup-only approval policy, source integrity and media identity');
})().catch(e=>{console.error(e);process.exitCode=1});
