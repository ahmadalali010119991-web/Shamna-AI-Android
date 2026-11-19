'use strict';const test=require('node:test'),a=require('node:assert/strict'),{inspect,approved}=require('./readonly-evidence.cjs');
const registry=[{channel:'source_test',peerId:'90071992547409999',roles:['source']},{channel:'destination_test',peerId:'5001',roles:['destination']}];
const ref={channel:'source_test',id:42,url:'https://t.me/source_test/42'};
const peer={className:'InputPeerChannel',channelId:registry[0].peerId};
const msg={className:'Message',id:42,peerId:{className:'PeerChannel',channelId:peer.channelId},media:{className:'MessageMediaDocument',document:{className:'Document',id:'91100000000000001',mimeType:'video/mp4',size:'1234',attributes:[{className:'DocumentAttributeVideo'}]}}};
function mock(opts={}){const calls=[];const client={async getInputEntity(c){calls.push(['entity',c]);if(opts.fail)throw Error('timeout');return opts.peer??peer;},async getMessages(p,q){calls.push(['message',p,q]);return opts.rows??[msg];}};return {client,calls};}
const cases=[
 ['native video',{},'confirmed-video'],
 ['text only',{rows:[{...msg,media:undefined}]},'confirmed-no-video'],
 ['photo',{rows:[{...msg,media:{className:'MessageMediaPhoto',photo:{className:'Photo',id:'21'}}}]},'confirmed-no-video'],
 ['unknown photo',{rows:[{...msg,media:{className:'MessageMediaPhoto'}}]},'unknown'],
 ['empty message',{rows:[{className:'MessageEmpty',id:42}]},'unknown'],
 ['wrong message',{rows:[{...msg,id:43}]},'unknown'],
 ['wrong peer',{peer:{...peer,channelId:'123'}},'unknown'],
 ['wrong message peer',{rows:[{...msg,peerId:{...msg.peerId,channelId:'123'}}]},'unknown'],
 ['absent message',{rows:[]},'unknown'],
 ['double message',{rows:[msg,msg]},'unknown'],
 ['unknown media',{rows:[{...msg,media:{className:'MessageMediaWebPage'}}]},'unknown'],
 ['document id missing',{rows:[{...msg,media:{...msg.media,document:{...msg.media.document,id:null}}}]},'unknown'],
 ['mime without attribute',{rows:[{...msg,media:{...msg.media,document:{...msg.media.document,attributes:[]}}}]},'unknown'],
 ['invalid size',{rows:[{...msg,media:{...msg.media,document:{...msg.media.document,size:0}}}]},'unknown'],
 ['connection failure',{fail:true},'unknown'],
 ['restricted source',{rows:[{...msg,noforwards:true}]},'confirmed-video']];
for(const [label,opts,expected] of cases)test(label,async()=>{const m=mock(opts),r=await inspect(m.client,ref,'source',registry);a.equal(r.status,expected);if(label==='native video'){a.equal(r.documentId,msg.media.document.id);a.equal(r.peerId,peer.channelId);a.deepEqual(m.calls[1][2],{ids:[42]});}if(label==='restricted source')a.equal(r.forwardRestricted,true);});
for(const [label,r,role,reg] of [
 ['wrong URL',{...ref,url:'https://t.me/source_test/43'},'source',registry],
 ['unauthorized channel',{channel:'outside_test',id:42,url:'https://t.me/outside_test/42'},'source',registry],
 ['destination cannot act as a source',{channel:'destination_test',id:42,url:'https://t.me/destination_test/42'},'source',registry],
 ['source cannot act as destination',ref,'destination',registry],
 ['missing peer pin',ref,'source',[{channel:'source_test',roles:['source']}]],
 ['untrusted role',ref,'publish',registry],
 ['wrong host',{...ref,url:'https://evil.example/source_test/42'},'source',registry]
 ])test(label,async()=>{const m=mock();a.equal((await inspect(m.client,r,role,reg)).status,'unknown');a.equal(m.calls.length,0);});
test('normalized exact source link',()=>a.equal(approved({...ref,url:'https://t.me/s/SOURCE_TEST/42?single'},'source',registry).pin,peer.channelId));
test('destination read succeeds with its own peer pin',async()=>{const p={className:'InputPeerChannel',channelId:'5001'},m=mock({peer:p,rows:[{...msg,peerId:{className:'PeerChannel',channelId:'5001'}}]});a.equal((await inspect(m.client,{channel:'destination_test',id:42,url:'https://t.me/destination_test/42'},'destination',registry)).status,'confirmed-video');});