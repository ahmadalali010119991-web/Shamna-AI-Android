// Read-only recovery selection. Requires a trusted current authority and verification callback. Never authorize publishing or rotate accounts to evade quotas. This module is not a deployed service.
export async function selectVerifiedReplica({primary,replica,verify,authority,now=Date.now(),maxAgeMs=120000}){
 if(typeof primary!=="function"||typeof replica!=="function"||typeof verify!=="function"||typeof authority!=="function"||!Number.isFinite(now)||!Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300000)throw Error("invalid_configuration");
 const unavailable=(reason)=>({state:"unavailable",reason,publicationAllowed:false});
 const valid=async (candidate,head)=>{
  if(!candidate||candidate.status!==200||!candidate.snapshot||!head||!Number.isSafeInteger(head.revision)||head.revision<1||!Number.isFinite(head.checkedAt)||now-head.checkedAt>maxAgeMs||head.checkedAt>now+1000||typeof head.tombstoneDigest!=="string"||!/^[a-f0-9]{64}$/.test(head.tombstoneDigest))return false;
  const s=candidate.snapshot;
  if(s.revision!==head.revision||s.tombstoneDigest!==head.tombstoneDigest||s.complete!==true||s.stale!==false||!Number.isFinite(s.checkedAt)||now-s.checkedAt>maxAgeMs||s.checkedAt>now+1000)return false;
  return await verify(s,head)===true;
 };
 let p;try{p=await primary()}catch{p={status:503}};
 if(!p||!Number.isInteger(p.status))return unavailable("invalid_primary_response");
 if(p.status!==200&&p.status!==408&&p.status!==429&&p.status!==502&&p.status!==503&&p.status!==504&&p.status!==500)return unavailable("primary_not_retryable");
 let h;try{h=await authority()}catch{return unavailable("authority_unavailable")}
 if(p.status===200){try{if(await valid(p,h))return {state:"primary",snapshot:p.snapshot,publicationAllowed:false}}catch{}}
 let r;try{r=await replica()}catch{return unavailable("replica_unavailable")}
 try{if(await valid(r,h))return {state:"replica_read_only",snapshot:r.snapshot,publicationAllowed:false}}catch{}
 return unavailable("replica_not_verified");
}
