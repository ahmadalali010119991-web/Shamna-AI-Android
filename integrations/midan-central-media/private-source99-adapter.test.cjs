'use strict';
const assert=require('node:assert/strict');
const {normalizeSource99Article}=require('./private-source99-adapter.cjs');
const base={
 id:'private-source99-6',sourceId:'private-source99',
 sourceUrl:'https://t.me/Private_Source99/6',
 originalPostUrl:'https://t.me/Private_Source99/6',
 title:'',summary:'#القامشلي\nوصول المتظاهرين الى مخفر أبو قصايب جنوب القامشلي',
 editorialApproved:false,hasOriginalVideo:false,hasOriginalPhoto:true
};
const news=normalizeSource99Article(base);
assert.ok(news.article.title.includes('وصول المتظاهرين'));
assert.equal(news.article.mediaKind,'photo');
assert.equal(news.approvalRequired,true,'never silently bypass editorial gate');
assert.equal(news.mediaPending,true,'original image still needs fetch and verification');
assert.equal(news.article.sourceUrl,base.sourceUrl);
const video=normalizeSource99Article({...base,id:'private-source99-7',
 sourceUrl:'https://t.me/Private_Source99/7',originalPostUrl:'https://t.me/Private_Source99/7',
 hasOriginalVideo:true,hasOriginalPhoto:true,editorialApproved:true});
assert.equal(video.article.mediaKind,'video');
assert.equal(video.approved,true);
assert.throws(()=>normalizeSource99Article({...base,sourceId:'other'}),/AUTHORIZED/);
assert.throws(()=>normalizeSource99Article({...base,sourceUrl:'https://t.me/untrusted/6'}),/PROVENANCE/);
assert.throws(()=>normalizeSource99Article({...base,summary:'#القامشلي',title:''}),/EMPTY_ARTICLE/);
console.log('PASS: public source99 text title, original photo/video identification, editorial gate and provenance');
