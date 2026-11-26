import {discoverMetadata} from './discovery-worker.mjs';
const BRANCH='br-billowing-tooth-bgro2qih',NAME='midan-discovery-staging-smoke';
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowed=new Set([
 "INSERT INTO midan_queue.source_discovery_runs(run_key,source_id,state) VALUES($1,$2,'running') ON CONFLICT DO NOTHING RETURNING run_key",
 'SELECT * FROM midan_queue.preview_discovery_v1($1,$2::jsonb)',
 "UPDATE midan_queue.source_discovery_runs SET state=$2,checked_at=statement_timestamp(),observed=$3,eligible=$4,known=$5,queued=0,error=$6 WHERE run_key=$1 AND state='running' RETURNING state"
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

async function sourceProbe(source,slot){
 const key='qa:neon-discovery:'+source+':'+slot;let claimed=false;
 try{
  const c=await query("INSERT INTO midan_queue.source_discovery_runs(run_key,source_id,state) VALUES($1,$2,'running') ON CONFLICT DO NOTHING RETURNING run_key",[key,source]);
  if(c.rows.length!==1)return {source,state:'duplicate_slot'};
  claimed=true;
  const d=await discoverMetadata(source);
  const x=await query('SELECT * FROM midan_queue.preview_discovery_v1($1,$2::jsonb)',[source,JSON.stringify(d.items)]);
  const p=x.rows[0];if(x.rows.length!==1||Number(p.inserted)+Number(p.existing)!==d.items.length||Number(p.queued)!==Number(p.inserted))throw Error('preview_mismatch');
  const r=await query("UPDATE midan_queue.source_discovery_runs SET state=$2,checked_at=statement_timestamp(),observed=$3,eligible=$4,known=$5,queued=0,error=$6 WHERE run_key=$1 AND state='running' RETURNING state",[key,'ok',d.observed,d.eligible,p.existing,'preview_rolled_back_would_queue_'+p.queued]);
  if(r.rows.length!==1)throw Error('ledger_unconfirmed');
  return {source,state:'ok',observed:d.observed,eligible:d.eligible,wouldQueue:Number(p.queued)};
 }catch(e){const msg=String(e?.message||'');const reason=/^(?:http_\d{3}|not_xml|too_large|empty|empty_feed|invalid_feed|too_many_items|empty_or_stale_feed|preview_mismatch|ledger_unconfirmed)$/.test(msg)?msg:'probe_failed';
 if(claimed)try{await query("UPDATE midan_queue.source_discovery_runs SET state=$2,checked_at=statement_timestamp(),observed=$3,eligible=$4,known=$5,queued=0,error=$6 WHERE run_key=$1 AND state='running' RETURNING state",[key,'unavailable',null,null,null,reason])}catch{}
 return {source,state:'unavailable',reason};}
}
export default {async fetch(request){
 const url=new URL(request.url);
 if(request.method==='GET'&&url.pathname==='/health')return response({service:'discovery-runtime-v1',mode:'preview',publishing:false});
 if(request.method!=='POST'||url.pathname!=='/scheduled-discovery')return response({error:'not_found'},404);
 const id=request.headers.get('x-neon-trigger-invocation-id');if(!id)return response({error:'unauthorized'},401);
 if(process.env.NEON_BRANCH_ID!==BRANCH)return response({error:'wrong_branch'},503);
 let j;try{const raw=await request.text();if(raw.length>8192)throw Error();j=JSON.parse(raw)}catch{return response({error:'invalid_delivery'},400)}
 if(j.version!==1||j.invocation_id!==id||j.trigger?.type!=='schedule'||j.trigger?.name!==NAME)return response({error:'invalid_delivery'},401);
 const t=Date.parse(j.data?.scheduled_at),until=Date.parse(process.env.STAGING_RUN_UNTIL||'');
 if(!Number.isFinite(t)||!Number.isFinite(until)||Date.now()>until||Math.abs(Date.now()-t)>180000)return response({state:'outside_test_window'});
 const slot=new Date(t).toISOString();
 const results=await Promise.all(['sana','aljazeera'].map(s=>sourceProbe(s,slot)));
 return response({mode:'preview',results},results.every(x=>x.state==='ok'||x.state==='duplicate_slot')?200:503);
}};
