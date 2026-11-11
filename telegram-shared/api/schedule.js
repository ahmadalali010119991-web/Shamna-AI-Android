'use strict';
const core=require('../lib/core');
const engine=require('../lib/sync-v3-engine');
const rates=require('../lib/rates-publisher');
const githubOidc=require('../lib/github-oidc');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(!core.authorize(req,'cron')&&!(await githubOidc(req)))return res.status(401).json({error:'Unauthorized'});
  const jobs=await Promise.allSettled([engine.run(),rates.run()]);
  const sync=jobs[0].status==='fulfilled'?jobs[0].value:{ok:false,error:String(jobs[0].reason?.message||jobs[0].reason).slice(0,180)};
  const exchange=jobs[1].status==='fulfilled'?jobs[1].value:{status:'error',error:String(jobs[1].reason?.message||jobs[1].reason).slice(0,180)};
  if(exchange.status==='error')console.error('Hasibat image fallback:',exchange.error);
  if(jobs[0].status==='rejected')console.error('News synchronization:',sync.error);
  return res.status(jobs[0].status==='rejected'?503:200).json({...sync,rates:exchange});
};
