'use strict';
const engine=require('../lib/sync-v3-engine');
const sourceLinks=require('../lib/telegram-source-links');
const rates=require('../lib/rates-publisher');
const assets=require('../lib/assets-publisher');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(req.body&&typeof req.body==='object'&&Object.keys(req.body).length)return res.status(400).json({error:'Unexpected request body'});
  const now=new Date();
  const [news,photo,extra]=await Promise.allSettled([sourceLinks.withSourceLinks(()=>engine.run()),rates.run({now}),assets.run({now})]);
  const exchange=photo.status==='fulfilled'?photo.value:{status:'error',error:String(photo.reason?.message||photo.reason).slice(0,160)};
  if(photo.status==='rejected')console.error('Hasibat schedule:',exchange.error);
  const goldFuel=extra.status==='fulfilled'?extra.value:{status:'error',error:String(extra.reason?.message||extra.reason).slice(0,160)};
  if(extra.status==='rejected')console.error('Gold/fuel daily:',goldFuel.error);
  if(news.status==='rejected'){
    const error=String(news.reason?.message||news.reason).slice(0,160);
    console.error('News synchronization:',error);
    return res.status(503).json({ok:false,error,exchange,goldFuel});
  }
  return res.status(200).json({...news.value,exchange,goldFuel,exchangeSchedule:['07:00','11:00','15:00','19:00'],dailyAssetsTime:'09:00',zone:'Asia/Damascus'});
};
