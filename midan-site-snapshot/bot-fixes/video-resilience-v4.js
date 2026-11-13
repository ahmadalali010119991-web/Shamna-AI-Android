'use strict';
/**
 * Midan media resilience v4. Deterministic, source-bound video delivery.
 * Routes: verified source copy -> verified source forward + edit caption ->
 * publisher MP4 URL -> bounded MP4 upload -> reversible photo fallback + retry ledger.
 * The original article publisher remains the fallback and is never blocked by retry logging.
 */
const SOURCE_RE=/https?:\/\/(?:www\.)?t\.me\/([A-Za-z0-9_]{5,32})\/(\d+)/gi;
const VIDEO_MARK=/tgme_widget_message_video_player|tgme_widget_message_video_thumb|tgme_widget_message_roundvideo_player|<video\b|(?:og:video|twitter:player:stream)/i;
const MP4_RE=/\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)/i;
const TTL=180000,MAX_DOWNLOAD=45*1024*1024,RETRY_PREFIX='midan-media-retry/v4/';
const cache=new Map();let installed=false,running=null;
function safeUrl(raw){
 try{const u=new URL(String(raw||''));const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||!host.includes('.')||/^\d+(?:\.\d+){3}$/.test(host))return null;
  return u.href;
 }catch{return null}
}
function sourceRef(data){
 const all=String(data.caption||data.text||'')+' '+JSON.stringify(data.reply_markup||{});
 for(const m of all.matchAll(SOURCE_RE)){
  if(m[1].toLowerCase()!=='maydan_alkhabar')return {channel:m[1],id:Number(m[2]),url:'https://t.me/'+m[1]+'/'+m[2]};
 }
 return null;
}
async function sourceMedia(source,fetcher){
 const key=source.channel+'/'+source.id,old=cache.get(key);
 if(old&&Date.now()-old.at<TTL)return old.value;
 let value={hasVideo:false,urls:[],reason:'source_inaccessible'};
 try{
  const u='https://t.me/s/'+source.channel+'?before='+(source.id+1);
  const r=await fetcher(u,{signal:AbortSignal.timeout(7000),headers:{'User-Agent':'Mozilla/5.0 (compatible; MidanMedia/4.0)'}});
  if(!r.ok)throw Error('source HTTP '+r.status);
  const raw=await r.text(),mark='data-post="'+source.channel+'/'+source.id+'"',start=raw.indexOf(mark);
  if(start<0){value.reason='post_not_found';}
  else{
   const following=raw.indexOf('data-post="',start+mark.length);
   const html=raw.slice(start,following>start?following:start+40000);
   value.hasVideo=VIDEO_MARK.test(html);value.reason=value.hasVideo?'video_detected':'no_video_detected';
   const candidates=[];
   for(const m of html.matchAll(/(?:content|href|src)=["'](https:\/\/[^"']+)["']/gi)){
    if(MP4_RE.test(m[1]))candidates.push(m[1].replace(/&amp;/g,'&'));
   }
   value.urls=[...new Set(candidates.map(safeUrl).filter(Boolean))].slice(0,4);
  }
 }catch(e){value.reason=String(e.message||e).slice(0,110)}
 cache.set(key,{at:Date.now(),value});if(cache.size>150)cache.clear();
 return value;
}
function endpoint(url,action){return String(url).replace(/\/(?:sendMessage|sendPhoto)$/i,'/'+action)}
async function botCall(native,apiUrl,action,body,timeout=17000){
 const r=await native(endpoint(apiUrl,action),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
 const v=await r.json().catch(()=>null);
 if(!r.ok||!v?.ok)throw Error(action+': '+String(v?.description||r.status).slice(0,150));
 return v.result;
}
function mediaOK(result){return Boolean(result?.video?.file_id||((result?.document?.mime_type||'').startsWith('video/')&&result.document.file_id))}
function captionOf(data){
 let s=String(data.caption||data.text||'');
 // Captions must not silently lose material. Long original text uses the old publisher.
 return s.length<=1010?s:null;
}
function common(data,src){const body={chat_id:data.chat_id,from_chat_id:'@'+src.channel,message_id:src.id};if(data.reply_markup)body.reply_markup=data.reply_markup;return body}
async function copyVideo(native,api,data,src){
 const caption=captionOf(data);if(caption===null)throw Error('caption_too_long');
 const body={...common(data,src),caption};
 if(data.parse_mode)body.parse_mode=data.parse_mode;
 if(data.caption_entities)body.caption_entities=data.caption_entities;
 const ret=await botCall(native,api,'copyMessage',body,18000);
 if(!ret?.message_id)throw Error('copy_no_message_id');
 // copyMessage returns only MessageId: the public original was checked to be video.
 return {message_id:ret.message_id,chat:{id:data.chat_id},video:{copiedFrom:src.url},_midanTransport:'copy'};
}
async function forwardVideo(native,api,data,src){
 const body={...common(data,src),disable_notification:true};
 const ret=await botCall(native,api,'forwardMessage',body,18000);
 if(!ret?.message_id)throw Error('forward_no_message_id');
 if(!mediaOK(ret)){
  try{await botCall(native,api,'deleteMessage',{chat_id:data.chat_id,message_id:ret.message_id},9000)}catch{}
  throw Error('forwarded_media_not_video');
 }
 const caption=captionOf(data);
 if(caption!==null){
  try{
   const msg={chat_id:data.chat_id,message_id:ret.message_id,caption};
   if(data.parse_mode)msg.parse_mode=data.parse_mode;
   if(data.reply_markup)msg.reply_markup=data.reply_markup;
   await botCall(native,api,'editMessageCaption',msg,10000);
  }catch(e){/* The forwarded video is valid; retaining it is preferable to sending a photo. */}
 }
 return {...ret,_midanTransport:'forward'};
}
async function sendVideoByUrl(native,api,data,url){
 const caption=captionOf(data);if(caption===null)throw Error('caption_too_long');
 const body={chat_id:data.chat_id,video:url,caption,supports_streaming:true};
 if(data.parse_mode)body.parse_mode=data.parse_mode;
 if(data.reply_markup)body.reply_markup=data.reply_markup;
 const result=await botCall(native,api,'sendVideo',body,22000);
 if(!mediaOK(result))throw Error('sendVideo_missing_video');
 return {...result,_midanTransport:'remote_mp4'};
}
async function boundedDownload(native,url){
 const r=await native(url,{signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('download_http_'+r.status);
 const type=String(r.headers.get('content-type')||'').toLowerCase();
 const len=Number(r.headers.get('content-length')||0);
 if(type&&!/(video|octet-stream)/.test(type))throw Error('not_video_content_type');
 if(len>MAX_DOWNLOAD)throw Error('video_too_large_for_upload');
 const chunks=[];let total=0;
 for await(const chunk of r.body){total+=chunk.byteLength;if(total>MAX_DOWNLOAD)throw Error('bounded_download_limit');chunks.push(chunk)}
 return new Blob(chunks,{type:'video/mp4'});
}
async function sendVideoByUpload(native,api,data,url){
 const caption=captionOf(data);if(caption===null)throw Error('caption_too_long');
 const blob=await boundedDownload(native,url),form=new FormData();
 form.set('chat_id',String(data.chat_id));form.set('video',blob,'source.mp4');form.set('caption',caption);
 if(data.parse_mode)form.set('parse_mode',data.parse_mode);
 if(data.reply_markup)form.set('reply_markup',JSON.stringify(data.reply_markup));
 form.set('supports_streaming','true');
 const r=await native(endpoint(api,'sendVideo'),{method:'POST',body:form,signal:AbortSignal.timeout(42000)});
 const result=await r.json().catch(()=>null);
 if(!r.ok||!result?.ok||!mediaOK(result.result))throw Error('upload_video_failed_'+String(result?.description||r.status).slice(0,100));
 return {...result.result,_midanTransport:'upload_mp4'};
}
function asResponse(result){return new Response(JSON.stringify({ok:true,result}),{status:200,headers:{'Content-Type':'application/json'}})}
function blobAPI(){try{return require('@vercel/blob')}catch{return null}}
async function recordPending(src,data,targetMessageId,reasons,extra={}){
 if(!process.env.BLOB_READ_WRITE_TOKEN||!targetMessageId)return false;
 const blob=blobAPI();if(!blob)return false;
 const record={schema:4,source:src.url,channel:src.channel,sourceId:src.id,destination:data.chat_id,targetMessageId:Number(targetMessageId),
  attempts:0,nextRetry:Date.now()+300000,createdAt:Date.now(),errors:reasons.slice(-6),caption:captionOf(data)?.slice(0,1024)||'',parse_mode:data.parse_mode||'',reply_markup:data.reply_markup||null,...extra};
 try{
  await blob.put(RETRY_PREFIX+src.channel+'-'+src.id+'-'+targetMessageId+'.json',JSON.stringify(record),
   {access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
  return true;
 }catch(e){console.warn('Midan media retry ledger unavailable:',String(e.message||e).slice(0,100));return false}
}
async function handle(native,api,data,src){
 const video=await sourceMedia(src,native);
 if(!video.hasVideo)return {handled:false};
 const errors=[];
 // Route 1: Telegram native copy (preserves full video without size-dependent web download).
 try{return {handled:true,result:await copyVideo(native,api,data,src)}}catch(e){errors.push(String(e.message||e))}
 // Route 2: Telegram native forward (returns the actual video metadata).
 try{return {handled:true,result:await forwardVideo(native,api,data,src)}}catch(e){errors.push(String(e.message||e))}
 // Route 3: Telegram downloads a publisher-hosted MP4 URL.
 for(const url of video.urls){
  try{return {handled:true,result:await sendVideoByUrl(native,api,data,url)}}catch(e){errors.push(String(e.message||e))}
  // Route 4: upload MP4 via bounded multipart; size/network limits are enforced.
  try{return {handled:true,result:await sendVideoByUpload(native,api,data,url)}}catch(e){errors.push(String(e.message||e))}
 }
 return {handled:false,pending:true,errors,video};
}
function install(){
 if(installed)return;installed=true;
 const native=globalThis.fetch;
 if(typeof native!=='function')return;
 globalThis.fetch=async function(url,init){
  const raw=typeof url==='string'?url:url?.url||'';
  if(!/^https:\/\/api\.telegram\.org\/bot[^/]+\/(?:sendPhoto|sendMessage)$/i.test(raw)||typeof init?.body!=='string')
   return native.apply(this,arguments);
  let data,src;try{data=JSON.parse(init.body);src=sourceRef(data)}catch{}
  if(!src||!data?.chat_id)return native.apply(this,arguments);
  let attempt={handled:false};
  try{attempt=await handle(native,raw,data,src)}catch(e){attempt={handled:false,errors:[String(e.message||e)]}}
  if(attempt.handled)return asResponse(attempt.result);
  const response=await native.apply(this,arguments);
  // Fallback photo/message was not a video. Keep the original feed alive,
  // but log a retry to repair the exact existing message instead of reposting it.
  if(attempt.pending&&response.ok){
   try{
    const j=await response.clone().json();
    if(j?.ok&&j.result?.message_id){
     await recordPending(src,data,j.result.message_id,attempt.errors,{videoDetected:true});
    }
   }catch(e){console.warn('Media fallback audit:',String(e.message||e).slice(0,80))}
  }
  return response;
 }
}
async function getVideoFile(native,api,src,chat){
 const temp=await botCall(native,api,'forwardMessage',{chat_id:chat,from_chat_id:'@'+src.channel,message_id:src.id,disable_notification:true},18000);
 const mid=temp?.message_id;
 try{
  if(!mediaOK(temp))throw Error('source_forward_does_not_expose_video');
  return {fileId:temp.video?.file_id||temp.document?.file_id,mediaType:temp.video?'video':'document'};
 }finally{
  if(mid)try{await botCall(native,api,'deleteMessage',{chat_id:chat,message_id:mid},9000)}catch(e){console.warn('temporary video forward cleanup failed')}
 }
}
async function repairTarget(job,native,api){
 const source={channel:job.channel,id:job.sourceId,url:job.source},state=await sourceMedia(source,native);
 if(!state.hasVideo)throw Error('source_video_not_detected');
 const video=await getVideoFile(native,api,source,job.destination);
 const media={type:'video',media:video.fileId,caption:job.caption||'',supports_streaming:true};
 if(job.parse_mode)media.parse_mode=job.parse_mode;
 const request={chat_id:job.destination,message_id:job.targetMessageId,media};
 if(job.reply_markup)request.reply_markup=job.reply_markup;
 const msg=await botCall(native,api,'editMessageMedia',request,20000);
 if(!mediaOK(msg))throw Error('editMessageMedia_did_not_return_video');
 return {ok:true,message_id:job.targetMessageId};
}
async function retryPending(native=globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch){
 if(running)return running;
 running=(async()=>{
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.BLOB_READ_WRITE_TOKEN)return {skipped:'not_configured'};
  const blob=blobAPI();if(!blob)return {skipped:'no_blob_sdk'};
  const api='https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage';
  let entries;
  try{entries=(await blob.list({prefix:RETRY_PREFIX,limit:60})).blobs||[]}catch(e){return {skipped:'ledger_unavailable'}}
  let success=0,failed=0,scanned=0;
  for(const row of entries.slice(0,12)){
   let job;try{job=await native(row.url,{signal:AbortSignal.timeout(9000)}).then(r=>r.json())}catch{continue}
   if(job.schema!==4||job.nextRetry>Date.now()||job.attempts>=12)continue;scanned++;
   try{
    await repairTarget(job,native,api);
    await blob.del(row.url);success++;
   }catch(e){
    failed++;job.attempts++;job.errors=[...(job.errors||[]).slice(-5),String(e.message||e).slice(0,130)];
    const intervals=[300000,900000,3600000,21600000,43200000,86400000];
    job.nextRetry=Date.now()+intervals[Math.min(job.attempts,intervals.length-1)];
    try{await blob.put(row.pathname,JSON.stringify(job),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60})}catch{}
   }
  }
  if(scanned)console.info('Midan video retries',{scanned,success,failed});
  return {scanned,success,failed};
 })().finally(()=>{running=null});
 return running;
}
module.exports={install,retryPending,sourceRef,sourceMedia,repairTarget,recordPending};
