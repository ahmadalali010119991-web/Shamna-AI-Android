'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('./private-source99.cjs');

function post(id,body,extra=''){
 const when=new Date('2026-11-12T20:00:00.000Z').toISOString();
 return '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="Private_Source99/'+id+'">'+
 '<div class="tgme_widget_message_text js-message_text" dir="auto">'+body+'</div>'+
 extra+'<time datetime="'+when+'"></time></div></div>';
}
test('Private Source public text is ingested with exact permalink and attribution',()=>{
 const x=parse(post(2,'ورد إلى مصدر خاص خبر من مدينة القامشلي<br/>تفاصيل أولية عن القضية'));
 assert.equal(x.length,1);assert.equal(x[0].id,'private-source99-2');
 assert.equal(x[0].url,'https://t.me/Private_Source99/2');
 assert.equal(x[0].source,'مصدر خاص');assert.equal(x[0].sourceId,'private-source99');
 assert.equal(x[0].editorialApproved,false);
 assert.ok(x[0].summary.includes('تفاصيل أولية'));
});
test('Publishes photo/video-only source records without inventing a dateline',()=>{
 const a=parse(post(3,'','<div class="tgme_widget_message_video"></div>'));
 assert.equal(a.length,1);assert.equal(a[0].hasOriginalVideo,true);
 assert.equal(a[0].country,'');assert.equal(a[0].province,'');
 const b=parse(post(4,'','<div class="tgme_widget_message_photo_wrap"></div>'));
 assert.equal(b.length,1);assert.equal(b[0].hasOriginalPhoto,true);
});
test('Ignore empty channel-created notices and unrelated publishers',()=>{
 assert.equal(parse(post(1,'Channel created')).length,0);
 assert.equal(parse(post(5,'')).length,0);
 assert.equal(parse(post(7,'خبر جديد عاجل').replaceAll('Private_Source99','AnotherChannel')).length,0);
});
test('Do not include same message more than once',()=>{
 const html=post(8,'خبر مهم ومفصل من مصدر خاص');
 const x=parse(html+html);
 assert.equal(x.length,1);assert.equal(x[0].id,'private-source99-8');
});
