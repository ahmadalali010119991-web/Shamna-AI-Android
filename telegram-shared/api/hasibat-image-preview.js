'use strict';
const renderer=require('../lib/hasibat-image');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const rates=await renderer.freshRates();
    const number=Math.max(0,Math.min(52,Math.trunc(Number(req.query?.tip||0))||0));
    const snapshot=renderer.makeSnapshot(rates,renderer.messages[number]);
    if(req.query?.mode==='metadata')
      return res.status(200).json({ok:true,renderer:'Hasibat 1.8.21 original Canvas coordinates',rows:snapshot.results,tipIndex:number,checkedAt:snapshot.checkedAt,ageSeconds:rates.ageSeconds,zone:'Asia/Damascus'});
    const png=await renderer.generatePng(snapshot);
    res.setHeader('Content-Type','image/png');
    res.setHeader('Content-Disposition','inline; filename="Hasibat-App-Image.png"');
    return res.status(200).end(png.buffer);
  }catch(e){console.error('Hasibat preview:',String(e.message).slice(0,140));return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
};
