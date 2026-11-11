'use strict';
const core=require('../lib/core');
const legacy=require('../lib/sync-v2-base');
const rates=require('../lib/rates-publisher');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!core.authorize(req,'cron')&&!(await legacy.authorize(req)))
    return res.status(401).json({error:'Unauthorized'});
  try{return res.status(200).json({ok:true,result:await rates.run({requestedSlot:String(req.query?.slot||'')})})}
  catch(e){console.error('Hasibat scheduled image:',String(e.message).slice(0,180));return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
};
