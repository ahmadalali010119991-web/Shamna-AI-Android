// Media header validation preserved from the deployed Cloudflare enrichment worker.
// Staging runner. No bot credentials, publishing calls, or production database connection.
function identity(raw){try{const u=new URL(raw);const m=u.pathname.match(/^\/([a-z0-9-]+(?:\/[a-z0-9-]+){0,3})\/(\d{6,9})\/?$/i);return u.protocol==='https:'&&['sana.sy','www.sana.sy'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&m?{id:m[2],key:'sana:'+m[2],category:m[1].split('/')[0].toLowerCase()}:null}catch{return null}}
function media(raw,base){if(typeof raw!=="string"||!raw.trim())return null;try{const u=new URL(raw,base);return u.protocol==='https:'&&['sana.sy','cdn.sananews.sy','www.sana.sy'].includes(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null}catch{return null}}
function ajId(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||!['aljazeera.net','www.aljazeera.net'].includes(u.hostname)||u.port||u.username||u.password)return null;const path=decodeURIComponent(u.pathname).normalize('NFC').replace(/\/+$/,'');const m=path.match(/^\/([a-z-]+)\/\d{4}\/\d{1,2}\/\d{1,2}\/[^/]+$/i);if(!m||path.length>600)return null;return {key:'aljazeera:'+path.split('/').map((v,i)=>i===0?'':encodeURIComponent(v)).join('/'),category:m[1]}}catch{return null}}
function ajMedia(raw,base){if(typeof raw!=='string'||!raw.trim())return null;try{const u=new URL(raw,base);if(u.protocol!=='https:'||u.username||u.password||u.port||!['aljazeera.net','www.aljazeera.net','aja.ws','www.aja.ws'].includes(u.hostname)||!u.pathname.startsWith('/wp-content/uploads/'))return null;u.search='';u.hash='';return u.href}catch{return null}}
function pictureDimensions(b){const v=new DataView(b.buffer,b.byteOffset,b.byteLength),n=b.length;const eq=(i,s)=>i+s.length<=n&&[...s].every((c,j)=>b[i+j]===c.charCodeAt(0));if(n>=24&&b[0]===137&&eq(1,'PNG')&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10&&eq(12,'IHDR'))return {mime:'image/png',width:v.getUint32(16),height:v.getUint32(20)};if(n>=10&&(eq(0,'GIF87a')||eq(0,'GIF89a')))return {mime:'image/gif',width:v.getUint16(6,true),height:v.getUint16(8,true)};if(n>=30&&eq(0,'RIFF')&&eq(8,'WEBP')){if(eq(12,'VP8X'))return {mime:'image/webp',width:1+b[24]+256*b[25]+65536*b[26],height:1+b[27]+256*b[28]+65536*b[29]};if(eq(12,'VP8L')&&b[20]===47){const x=v.getUint32(21,true);return {mime:'image/webp',width:1+(x&16383),height:1+((x>>>14)&16383)}}if(eq(12,'VP8 ')&&b[23]===157&&b[24]===1&&b[25]===42)return {mime:'image/webp',width:v.getUint16(26,true)&16383,height:v.getUint16(28,true)&16383}}if(n>=4&&b[0]===255&&b[1]===216){let i=2;while(i+4<n){if(b[i]!==255)break;while(i<n&&b[i]===255)i++;if(i>=n)break;const marker=b[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(i+2>n)break;const len=v.getUint16(i);if(len<2||i+len>n)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=7)return {mime:'image/jpeg',width:v.getUint16(i+5),height:v.getUint16(i+3)};i+=len}}throw Error('unsupported_or_incomplete_image_header')}
async function imageHeader(response){if(!response.body)throw Error('empty_image_body');const reader=response.body.getReader(),out=new Uint8Array(65536);let n=0;try{while(n<out.length){const r=await reader.read();if(r.done)break;const k=Math.min(r.value.length,out.length-n);out.set(r.value.subarray(0,k),n);n+=k;try{return pictureDimensions(out.subarray(0,n))}catch{}}return pictureDimensions(out.subarray(0,n))}finally{try{await reader.cancel()}catch{}}}
export async function verifyMedia(row,fetcher=fetch){
 let http=null;
 try{
  const ident=row.source_id==='sana'?identity(row.source_url):row.source_id==='aljazeera'?ajId(row.source_url):null;
  const u=ident&&ident.key===row.source_key?(row.source_id==='sana'?media(row.url,row.source_url):ajMedia(row.url,row.source_url)):null;
  if(!u||u!==row.url)throw Error('image_url_not_allowed');
  const r=await fetcher(u,{redirect:'manual',headers:{Range:'bytes=0-65535',Accept:'image/jpeg,image/png,image/webp,image/gif'},signal:AbortSignal.timeout(12000)});
  http=r.status;
  if(http!==200&&http!==206){try{await r.body?.cancel()}catch{}throw Error('http_'+http)}
  const ct=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/jpeg','image/png','image/webp','image/gif'].includes(ct)){try{await r.body?.cancel()}catch{}throw Error('invalid_image_mime')}
  const d=await imageHeader(r);
  if(d.mime!==ct||!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<1||d.height<1||d.width>30000||d.height>30000)throw Error('invalid_image_dimensions_or_mime');
  return {ok:true,mime:d.mime,width:d.width,height:d.height,http,error:null};
 }catch(e){const msg=String(e?.message||'');return {ok:false,mime:null,width:null,height:null,http,error:/^(?:image_url_not_allowed|http_\d{3}|invalid_image_mime|invalid_image_dimensions_or_mime|empty_image_body|unsupported_or_incomplete_image_header)$/.test(msg)?msg:'image_check_failed'}}
}
export async function runMediaBatch(db,{limit=3,fetcher=fetch}={}){
 if(!Number.isInteger(limit)||limit<1||limit>3||typeof db?.query!=='function')throw Error('invalid_media_batch');
 const recovered=await db.query('SELECT midan_queue.recover_media_v1($1) AS recovered',[20]);
 if(!Array.isArray(recovered?.rows)||recovered.rows.length!==1)throw Error('recovery_unconfirmed');
 const result=await db.query('SELECT * FROM midan_queue.claim_media_v1($1,$2)',[limit,120]);
 if(!Array.isArray(result?.rows)||result.rows.length>limit)throw Error('invalid_claim_result');
 const rows=result.rows;
 if(new Set(rows.map(x=>String(x.job_id))).size!==rows.length||rows.some(x=>!/^\d+$/.test(String(x.job_id))||!/^[0-9a-f-]{36}$/i.test(x.lease_token||'')))throw Error('invalid_lease');
 const outcomes=await Promise.all(rows.map(async row=>{
  const d=await verifyMedia(row,fetcher);
  try{
   const saved=await db.query('SELECT midan_queue.finish_media_v1($1,$2,$3,$4,$5,$6,$7,$8) AS saved',[row.job_id,row.lease_token,d.ok,d.mime,d.width,d.height,d.http,d.error]);
   if(saved?.rows?.length!==1||saved.rows[0].saved!==true)return {state:'completion_unconfirmed'};
   return {state:d.ok?(Math.max(d.width,d.height)>=640&&Math.min(d.width,d.height)>=360?'available':'low_resolution'):'retry_or_blocked'};
  }catch{return {state:'completion_unconfirmed'}}
 }));
 return {claimed:rows.length,recovered:Number(recovered.rows[0].recovered),outcomes};
}
