'use strict';
const engine=require('../lib/sync-v3-engine');
const core=require('../lib/core');
const old=require('../lib/sync-v2-base');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(req.body&&typeof req.body==='object'&&Object.keys(req.body).length)return res.status(400).json({error:'Unexpected request body'});
  if(!core.authorize(req,'cron')&&!(await old.authorize(req)))return res.status(401).json({error:'Unauthorized'});
  try{
    const result=await engine.run();
    return res.status(200).json({...result,exchange:{status:'scheduled-separately',slots:['07:00','19:00'],zone:'Asia/Damascus'}});
  }catch(e){console.error('News task:',String(e.message).slice(0,160));return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
};
