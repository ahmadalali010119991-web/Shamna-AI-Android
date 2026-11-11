'use strict';
const c=require('../lib/core');
const rates=require('../lib/rates-publisher');
module.exports=async(req,res)=>{
  if(req.method!=='GET')return c.reply(res,405,{error:'Method not allowed'});
  const out={ok:true,service:'Dallalna Telegram Bridge',configured:c.configured(),
    missing:c.missing(),channel:'@maydan_alkhabar',timeZone:'Asia/Damascus',
    scheduleLocal:['07:00','11:00','15:00','19:00']};
  if(req.query?.check==='bot'){
    try{out.telegram=await c.botCheck()}catch(err){out.telegram={ok:false,error:err.message}}
  }
  if(req.query?.check==='rates-delivery'){
    const date=rates.stamp(new Date()).date;
    const keys={test:'once/rates:2026-11-11-live-test-app-image-v1',
      '07':'once/rates:'+date+'-07-hasibat-image-v1',
      '11':'once/rates:'+date+'-11-hasibat-image-v1',
      '15':'once/rates:'+date+'-15-hasibat-image-v1',
      '19':'once/rates:'+date+'-19-hasibat-image-v1'};
    const results=await Promise.all(Object.entries(keys).map(async([label,key])=>{
      try{
        const state=await rates.stateCall('read',key);
        return [label,{sent:!!state.record?.completed_at,
          messageId:state.record?.value?.message_id||null,
          lastUpdate:state.record?.updated_at||null,
          leased:!!state.record?.lease_id,
          error:null}];
      }catch(e){return [label,{sent:false,messageId:null,error:String(e.message).slice(0,100)}]}
    }));
    out.delivery={date,checks:Object.fromEntries(results)};
  }
  return c.reply(res,200,out);
};
