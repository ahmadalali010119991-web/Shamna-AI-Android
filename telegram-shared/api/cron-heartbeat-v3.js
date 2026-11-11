'use strict';
const engine=require('../lib/sync-v3-engine');
const rates=require('../lib/rates-publisher');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(req.body&&typeof req.body==='object'&&Object.keys(req.body).length)return res.status(400).json({error:'Unexpected request body'});
  const now=new Date();
  const [news,photo]=await Promise.allSettled([engine.run(),rates.run({now})]);
  const exchange=photo.status==='fulfilled'?photo.value:{status:'error',error:String(photo.reason?.message||photo.reason).slice(0,160)};
  if(photo.status==='rejected')console.error('Hasibat schedule:',exchange.error);
  if(news.status==='rejected'){
    const error=String(news.reason?.message||news.reason).slice(0,160);
    console.error('News synchronization:',error);
    return res.status(503).json({ok:false,error,exchange});
  }
  return res.status(200).json({...news.value,exchange,exchangeSchedule:['07:00','11:00','15:00','19:00'],zone:'Asia/Damascus'});
};
