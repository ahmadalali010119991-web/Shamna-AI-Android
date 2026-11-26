import {discoverMetadata} from './discovery-worker.mjs';
import {extractSanaNode} from './extraction-sana-node.mjs';
const BRANCH='br-billowing-tooth-bgro2qih',NAME='midan-extraction-staging-smoke';
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowed=new Set([
 "INSERT INTO midan_queue.extraction_runtime_runs_v1(slot,state) VALUES($1,'running') ON CONFLICT DO NOTHING RETURNING slot",
 'SELECT * FROM midan_queue.preview_extraction_v1($1::jsonb,$2::jsonb)',
 "UPDATE midan_queue.extraction_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state"
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
 if(request.method==='GET'&&url.pathname==='/health')return response({service:'extraction-preview-v1',publishing:false});
 if(request.method!=='POST'||url.pathname!=='/scheduled-extraction')return response({error:'not_found'},404);
 const id=request.headers.get('x-neon-trigger-invocation-id');if(!id)return response({error:'unauthorized'},401);
 if(process.env.NEON_BRANCH_ID!==BRANCH)return response({error:'wrong_branch'},503);
 let j;try{const raw=await request.text();if(raw.length>8192)throw Error();j=JSON.parse(raw)}catch{return response({error:'invalid_delivery'},400)}
 if(j.version!==1||j.invocation_id!==id||j.trigger?.type!=='schedule'||j.trigger?.name!==NAME)return response({error:'invalid_delivery'},401);
 const t=Date.parse(j.data?.scheduled_at),until=Date.parse(process.env.STAGING_RUN_UNTIL||'');
 if(!Number.isFinite(t)||!Number.isFinite(until)||Date.now()>until||Math.abs(Date.now()-t)>180000)return response({state:'outside_test_window'});
 const slot=new Date(t).toISOString();let claimed=false,stage='claim';
 try{
 const r=await query("INSERT INTO midan_queue.extraction_runtime_runs_v1(slot,state) VALUES($1,'running') ON CONFLICT DO NOTHING RETURNING slot",[slot]);if(r.rows.length!==1)return response({state:'duplicate_slot'});claimed=true;
 stage='discovery';const d=await discoverMetadata('sana');const item=d.items.find(x=>x.key==='sana:2645888')||d.items[0];if(!item)throw Error('no_fresh_candidates');
 stage='extraction';const x=await extractSanaNode({source_id:'sana',source_key:item.key,source_url:item.url,published_at:item.at});if(x.state!=='ready_for_review')throw Error('sample_not_ready');
 stage='preview';const a=await query('SELECT * FROM midan_queue.preview_extraction_v1($1::jsonb,$2::jsonb)',[JSON.stringify(item),JSON.stringify(x)]);const p=a.rows[0];
 if(a.rows.length!==1||p.source_key!==item.key||p.text_sha256!==x.hash||Number(p.paragraphs)!==x.paragraphs.length||Number(p.photos)!==x.images.length||p.readiness!=='media_required')throw Error('preview_mismatch');
 const paragraphMetrics=await Promise.all(x.paragraphs.map(async v=>({length:v.length,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('')})));const result={source:'sana',key:item.key,url:item.url,publishedAt:item.at,hash:x.hash,paragraphs:x.paragraphs.length,paragraphMetrics,photos:x.images.length,images:x.images,readiness:p.readiness,mode:'rolled_back_preview'};
 stage='record';const done=await query("UPDATE midan_queue.extraction_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state",[slot,'completed',JSON.stringify(result)]);if(done.rows.length!==1)throw Error('ledger_unconfirmed');
 return response({state:'completed'});
 }catch(e){if(claimed)try{await query("UPDATE midan_queue.extraction_runtime_runs_v1 SET state=$2,finished_at=statement_timestamp(),result=$3::jsonb WHERE slot=$1 AND state='running' RETURNING state",[slot,'failed',JSON.stringify({stage,error:/^[a-z0-9_]{1,100}$/.test(String(e?.message||''))?e.message:'runtime_failed'})])}catch{}return response({state:'failed'},503)}
}};
