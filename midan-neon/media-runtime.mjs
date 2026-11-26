import {runMediaBatch} from './media-worker.mjs';
const BRANCH='br-billowing-tooth-bgro2qih',VERSION='media-runtime-v1',NAME='midan-media-staging-smoke';
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowed=new Set([
 'SELECT midan_queue.recover_media_v1($1) AS recovered',
 'SELECT * FROM midan_queue.claim_media_v1($1,$2)',
 'SELECT midan_queue.finish_media_v1($1,$2,$3,$4,$5,$6,$7,$8) AS saved',
 "INSERT INTO midan_queue.media_runtime_runs_v1(slot,state) VALUES($1,'running') ON CONFLICT DO NOTHING RETURNING slot",
 "UPDATE midan_queue.media_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state"
]);
async function query(sql,params){
 if(process.env.NEON_BRANCH_ID!==BRANCH||!allowed.has(sql))throw Error('scope_rejected');
 const cs=process.env.DATABASE_URL;if(!cs)throw Error('missing_database');
 const u=new URL(cs);if(!['postgres:','postgresql:'].includes(u.protocol)||!/^ep-weathered-wave-bgi7rz89(?:-pooler)?\.c-9\.eu-central-1\.aws\.neon\.tech$/.test(u.hostname))throw Error('unexpected_database_host');
 const endpoint='https://'+u.hostname.replace(/^[^.]+\./,'api.')+'/sql';
 const r=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json','Neon-Connection-String':cs,'Neon-Raw-Text-Output':'true','Neon-Array-Mode':'true'},body:JSON.stringify({query:sql,params:params.map(v=>v===null?null:String(v))})});
 if(!r.ok){await r.body?.cancel();throw Error('database_http_'+r.status)}
 const x=await r.json();if(!Array.isArray(x.fields)||!Array.isArray(x.rows)||x.rows.length>50)throw Error('bad_database_result');
 const rows=x.rows.map(row=>{if(!Array.isArray(row)||row.length!==x.fields.length)throw Error('bad_row');return Object.fromEntries(x.fields.map((f,i)=>[f.name,row[i]===null?null:f.dataTypeID===16?(row[i]==='t'||row[i]===true):row[i]]))});
 return {rows};
}
export default {async fetch(request){
 const url=new URL(request.url);
 if(request.method==='GET'&&url.pathname==='/health')return response({service:VERSION,mode:'staging',publishing:false});
 if(request.method!=='POST'||url.pathname!=='/scheduled-media')return response({error:'not_found'},404);
 const id=request.headers.get('x-neon-trigger-invocation-id');if(!id)return response({error:'unauthorized'},401);
 if(process.env.NEON_BRANCH_ID!==BRANCH)return response({error:'wrong_branch'},503);
 let j;try{const raw=await request.text();if(raw.length>8192)throw Error();j=JSON.parse(raw)}catch{return response({error:'invalid_delivery'},400)}
 if(j.version!==1||j.invocation_id!==id||j.trigger?.type!=='schedule'||j.trigger?.name!==NAME)return response({error:'invalid_delivery'},401);
 const t=Date.parse(j.data?.scheduled_at),until=Date.parse(process.env.STAGING_RUN_UNTIL||'');
 if(!Number.isFinite(t)||!Number.isFinite(until)||Date.now()>until||Math.abs(Date.now()-t)>180000)return response({state:'outside_test_window'});
 const slot=new Date(t).toISOString();let claimed=false;
 try{
  const a=await query("INSERT INTO midan_queue.media_runtime_runs_v1(slot,state) VALUES($1,'running') ON CONFLICT DO NOTHING RETURNING slot",[slot]);if(a.rows.length!==1)return response({state:'duplicate_slot'});claimed=true;
  const r=await runMediaBatch({query},{limit:1});const failed=r.outcomes.some(x=>x.state==='completion_unconfirmed');
  await query("UPDATE midan_queue.media_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state",[slot,failed?'failed':'completed',JSON.stringify(r)]);
  return response({state:failed?'failed':'completed'},failed?503:200);
 }catch(e){if(claimed)try{await query("UPDATE midan_queue.media_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state",[slot,'failed',JSON.stringify({error:'runtime_failed'})])}catch{}return response({state:'runtime_failed'},503)}
}};
