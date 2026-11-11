'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const p=require('../rates-publisher');
test('Supabase metadata contract: authorized read and claim only, no public state',async()=>{
  const before=global.fetch,previous=process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN='123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcDEFghi';
  const seen=[];
  global.fetch=async (url,opts)=>{
    seen.push({url:String(url),opts});
    return new Response(JSON.stringify(seen.length===1?{found:false,record:null}:{ok:true,record:{lease_id:'11111111-1111-4111-8111-111111111111'}}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const empty=await p.stateCall('read','state/hasibat-telegram-rotation-v1');
    assert.equal(empty.found,false);
    assert.equal(seen[0].opts.method,'GET');
    assert.match(seen[0].url,/op=read/);
    assert.match(seen[0].url,/key=state%2Fhasibat/);
    assert.equal(seen[0].opts.headers.authorization,'Bearer '+process.env.TELEGRAM_BOT_TOKEN);
    const claim=await p.stateCall('claim','once/rates:2026-11-11-07-hasibat-image-v1',{}, {lease_seconds:300});
    assert.equal(claim.ok,true);
    assert.equal(seen[1].opts.method,'POST');
    const body=JSON.parse(seen[1].opts.body);
    assert.equal(body.op,'claim');
    assert.equal(body.lease_seconds,300);
    assert.ok(!('token' in body)&&!('secret' in body));
  }finally{global.fetch=before;if(previous===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=previous}
});
