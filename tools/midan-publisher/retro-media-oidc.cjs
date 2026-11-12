'use strict';
const crypto=require('node:crypto');
const REPO='ahmadalali010119991-web/Shamna-AI-Android';
const REF=REPO+'/.github/workflows/midan-telegram-sync.yml@refs/heads/main';
module.exports=async function verifyRetroMediaOidc(req){
 try{
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const parts=token.split('.');
  if(parts.length!==3||parts.some(x=>x.length<8||x.length>6000))return false;
  const head=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  const now=Math.floor(Date.now()/1000);
  if(head.alg!=='RS256'||!head.kid||claims.iss!=='https://token.actions.githubusercontent.com'||
    claims.aud!=='dallalna-telegram-bridge'||claims.repository!==REPO||
    String(claims.repository_id)!=='1407097751'||claims.ref!=='refs/heads/main'||
    claims.workflow_ref!==REF||claims.event_name!=='push'||
    !Number.isFinite(claims.iat)||!Number.isFinite(claims.exp)||
    claims.exp<now||claims.iat>now+50||claims.iat<now-600||
    (claims.nbf&&claims.nbf>now+50))return false;
  const jwks=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',
    {signal:AbortSignal.timeout(8000),headers:{accept:'application/json'},cache:'no-store'});
  if(!jwks.ok)return false;
  const key=(await jwks.json()).keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(k.use==='sig'||!k.use));
  if(!key)return false;
  return crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));
 }catch{return false}
};
