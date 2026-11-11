'use strict';
const core=require('../lib/core');
const githubOidc=require('../lib/github-oidc');
const rates=require('../lib/rates-publisher');
const assets=require('../lib/assets-publisher');
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
  // Preview deployment only: independently inspect gold/fuel image rendering.
  // Do not permit preview requests to publish to the Telegram channel.
  if(process.env.VERCEL_ENV==='preview'&&req.method==='GET'&&['gold','fuel'].includes(req.query?.preview)){
    try{
      const kind=req.query.preview;
      const feed=require('../lib/assets-feed'),renderer=require('../lib/hasibat-assets-image');
      const tips=require('../lib/hasibat-image').messages;
      let snapshot;
      if(kind==='gold')snapshot=renderer.snapshotGold(await feed.gold(),tips[0]);
      else{
        const [price,meta]=await Promise.all([feed.fuel(),fetch('https://dallalna-telegram-bridge.vercel.app/api/rates-preview?mode=metadata',
          {signal:AbortSignal.timeout(12000)}).then(r=>r.json())]);
        const usd=feed.safeNumber(meta.rows?.find(x=>x.code==='USD')?.sellNew);
        snapshot=renderer.snapshotFuel(price,usd,tips[1]);
      }
      const png=await renderer.render(snapshot);
      res.setHeader('Content-Type','image/png');
      return res.status(200).end(png.buffer);
    }catch(e){return res.status(503).json({ok:false,error:String(e.message).slice(0,190)})}
  }
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!core.authorize(req,'cron')&&!(await githubOidc(req)))
    return res.status(401).json({error:'Unauthorized'});
  try{return res.status(200).json({ok:true,result:String(req.query?.slot||'')==='09'?await assets.run():await rates.run({requestedSlot:String(req.query?.slot||'')})})}
  catch(e){console.error('Hasibat scheduled image:',String(e.message).slice(0,180));return res.status(503).json({ok:false,error:String(e.message).slice(0,160)})}
};
