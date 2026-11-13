'use strict';
const crypto=require('node:crypto');
const c=require('../lib/core'),v=require('../lib/voice-video-first');
const oneTime=process.env.MIDAN_MEDIA_REPAIR_KEY||'';
function auth(req){const actual=String(req.headers['x-midan-restore']||'');const a=Buffer.from(actual),b=Buffer.from(oneTime);return b.length>=32&&a.length===b.length&&crypto.timingSafeEqual(a,b)}
module.exports=async(req,res)=>{
 if(req.method==='POST'&&req.query?.repair==='video552'){
  if(!auth(req))return c.reply(res,403,{ok:false,error:'Forbidden'});
  try{const result=await v.backfill552();return c.reply(res,result.updatedExistingMessage?200:424,{ok:result.updatedExistingMessage,...result})}
  catch(e){return c.reply(res,424,{ok:false,error:String(e.message||e).slice(0,220)})}
 }
 if(req.method!=='GET'&&req.method!=='POST')return c.reply(res,405,{error:'Method not allowed'});
 if(!c.authorize(req,'cron'))return c.reply(res,401,{error:'Unauthorized'});
 if(!c.configured())return c.reply(res,503,{error:'Not configured'});
 v.install();
 try{return c.reply(res,200,{ok:true,...await c.poll()})}
 catch(err){return c.reply(res,503,{ok:false,error:err.message})}
};