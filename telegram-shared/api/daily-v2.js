'use strict';
const core=require('../lib/core');
const rates=require('../lib/rates-publisher');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  // Preview-only dry run: produce PNG without Telegram credentials or posting.
  if(process.env.VERCEL_ENV==='preview'&&req.method==='GET'&&req.query?.preview==='image'){
    try{
      const img=require('../lib/hasibat-image');
      const rates=await img.freshRates();
      const snap=img.makeSnapshot(rates,img.messages[37]);
      const png=await img.generatePng(snap);
      res.setHeader('Content-Type','image/png');
      return res.status(200).end(png.buffer);
    }catch(e){return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
  }
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!core.authorize(req,'cron'))
    return res.status(401).json({error:'Unauthorized'});
  try{return res.status(200).json({ok:true,result:await rates.run({requestedSlot:String(req.query?.slot||'')})})}
  catch(e){console.error('Hasibat scheduled image:',String(e.message).slice(0,180));return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
};
