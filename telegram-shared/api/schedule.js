'use strict';
const crypto=require('node:crypto');
const core=require('../lib/core');
const engine=require('../lib/sync-v3-engine');
const rates=require('../lib/rates-publisher');
const REPO='ahmadalali010119991-web/Shamna-AI-Android';
const WORKFLOW=REPO+'/.github/workflows/midan-telegram-sync.yml@refs/heads/main';
function readOidc(jwt){
  const parts=String(jwt||'').split('.');
  if(parts.length!==3||parts.some(x=>!x||x.length>5000))return null;
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  const body=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  const time=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256'||!header.kid||
     body.iss!=='https://token.actions.githubusercontent.com'||
     body.aud!=='dallalna-telegram-bridge'||
     body.repository!==REPO||
     String(body.repository_id)!=='1407097751'||
     body.ref!=='refs/heads/main'||
     body.workflow_ref!==WORKFLOW||
     !['schedule','workflow_dispatch'].includes(body.event_name)||
     !Number.isFinite(body.exp)||body.exp<time||
     !Number.isFinite(body.iat)||body.iat>time+45||body.iat<time-600||
     (body.nbf&&body.nbf>time+45))return null;
  return {parts,header};
}
async function authorize(req){
  if(core.authorize(req,'cron'))return true;
  try{
    const jwt=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const claims=readOidc(jwt);if(!claims)return false;
    const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',
      {signal:AbortSignal.timeout(7000),cache:'no-store'});
    if(!r.ok)return false;
    const j=await r.json();
    const key=(j.keys||[]).find(k=>k.kid===claims.header.kid&&k.kty==='RSA'&&(k.use==='sig'||!k.use));
    if(!key)return false;
    return crypto.verify('RSA-SHA256',Buffer.from(claims.parts[0]+'.'+claims.parts[1]),
      crypto.createPublicKey({key,format:'jwk'}),Buffer.from(claims.parts[2],'base64url'));
  }catch(e){console.error('GitHub sync authorization rejected:',String(e.message).slice(0,100));return false}
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required'});
  if(!(await authorize(req)))return res.status(401).json({error:'Unauthorized'});
  const jobs=await Promise.allSettled([engine.run(),rates.run()]);
  const sync=jobs[0].status==='fulfilled'?jobs[0].value:{ok:false,error:String(jobs[0].reason?.message||jobs[0].reason).slice(0,180)};
  const exchange=jobs[1].status==='fulfilled'?jobs[1].value:{status:'error',error:String(jobs[1].reason?.message||jobs[1].reason).slice(0,180)};
  if(exchange.status==='error')console.error('Hasibat image fallback:',exchange.error);
  if(jobs[0].status==='rejected')console.error('News synchronization:',sync.error);
  return res.status(jobs[0].status==='rejected'?503:200).json({...sync,rates:exchange});
};
