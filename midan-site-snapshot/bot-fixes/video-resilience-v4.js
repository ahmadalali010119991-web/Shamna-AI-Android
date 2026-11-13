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
   // A public Telegram post may include attacker-supplied links. Only trust Telegram's own media CDN.
   value.urls=[...new Set(candidates.map(safeUrl).filter(u=>u&&/^(?:[a-z0-9-]+\.)*(?:telesco\.pe|telegram\.org)$/i.test(new URL(u).hostname)))].slice(0,4);
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
async function getVideoFile(native,api,source,chat){
 const staging=process.env.MEDIA_STAGING_CHAT_ID||chat,temporary=[],errors=[];
 const remove=async()=>{for(const messageId of temporary.reverse())try{await botCall(native,api,'deleteMessage',{chat_id:staging,message_id:messageId},8000)}catch(e){console.warn('Temporary staging message cleanup failed',messageId)}};
 try{
  // A. Direct forward from the public source; Bot API returns a verified Video.file_id.
  try{
   const msg=await botCall(native,api,'forwardMessage',{chat_id:staging,from_chat_id:'@'+source.channel,message_id:source.id,disable_notification:true},15000);
   if(msg?.message_id)temporary.push(msg.message_id);
   if(mediaOK(msg))return {fileId:msg.video?.file_id||msg.document?.file_id,via:'source_forward'};
   errors.push('forward_returned_no_video');
  }catch(e){errors.push('forward:'+String(e.message||e).slice(0,90))}
  // B. Some public channels permit copying but not forwarding.
  // Copy to a temporary message, forward THAT message within the owned chat to obtain a file_id.
  try{
   const copy=await botCall(native,api,'copyMessage',{chat_id:staging,from_chat_id:'@'+source.channel,message_id:source.id,disable_notification:true},15000);
   if(!copy?.message_id)throw Error('source_copy_no_message');
   temporary.push(copy.message_id);
   const reforward=await botCall(native,api,'forwardMessage',{chat_id:staging,from_chat_id:staging,message_id:copy.message_id,disable_notification:true},12000);
   if(reforward?.message_id)temporary.push(reforward.message_id);
   if(mediaOK(reforward))return {fileId:reforward.video?.file_id||reforward.document?.file_id,via:'copy_then_owned_forward'};
   errors.push('copied_message_not_video');
  }catch(e){errors.push('copy:'+String(e.message||e).slice(0,90))}
  throw Error('no_native_video_file_id: '+errors.join('; '));
 }finally{await remove()}
}
async function publicTargetIsVideo(native,chat,messageId){
 try{
  const channel=String(chat).replace(/^@/,'');
  if(!/^[a-zA-Z0-9_]{5,32}$/.test(channel))return false;
  const r=await native('https://t.me/s/'+channel+'?before='+(Number(messageId)+1),{signal:AbortSignal.timeout(8500)});
  if(!r.ok)return false;
  const raw=await r.text(),m='data-post="'+channel+'/'+messageId+'"',start=raw.indexOf(m);
  if(start<0)return false;
  const next=raw.indexOf('data-post="',start+m.length),slice=raw.slice(start,next>start?next:start+16000);
  return VIDEO_MARK.test(slice);
 }catch{return false}
}
async function editWithUrl(native,api,job,url){
 const media={type:'video',media:url,caption:job.caption||'',supports_streaming:true};
 if(job.parse_mode)media.parse_mode=job.parse_mode;
 const request={chat_id:job.destination,message_id:job.targetMessageId,media};
 if(job.reply_markup)request.reply_markup=job.reply_markup;
 const msg=await botCall(native,api,'editMessageMedia',request,25000);
 if(!mediaOK(msg))throw Error('edit_by_url_did_not_return_video');
 return {ok:true,via:'publisher_video_url',message_id:job.targetMessageId}
}
async function editWithUpload(native,api,job,url){
 const blob=await boundedDownload(native,url),form=new FormData();
 form.set('chat_id',String(job.destination));form.set('message_id',String(job.targetMessageId));
 const media={type:'video',media:'attach://clip',caption:job.caption||'',supports_streaming:true};
 if(job.parse_mode)media.parse_mode=job.parse_mode;
 form.set('media',JSON.stringify(media));
 if(job.reply_markup)form.set('reply_markup',JSON.stringify(job.reply_markup));
 form.set('clip',blob,'original.mp4');
 const r=await native(endpoint(api,'editMessageMedia'),{method:'POST',body:form,signal:AbortSignal.timeout(45000)});
 const v=await r.json().catch(()=>null);
 if(!r.ok||!v?.ok||!mediaOK(v.result))throw Error('edit_multipart_failed_'+String(v?.description||r.status).slice(0,120));
 return {ok:true,via:'bounded_mp4_upload',message_id:job.targetMessageId}
}
async function repairTarget(job,native,api){
 const source={channel:job.channel,id:job.sourceId,url:job.source};
 if(await publicTargetIsVideo(native,job.destination,job.targetMessageId))return {ok:true,via:'already_video',message_id:job.targetMessageId};
 const state=await sourceMedia(source,native);
 if(!state.hasVideo)throw Error('source_video_not_detected: '+state.reason);
 const errors=[];
 // A/B. Retrieve reusable Telegram file_id (forward or copy -> internal forward).
 try{
  const video=await getVideoFile(native,api,source,job.destination);
  const media={type:'video',media:video.fileId,caption:job.caption||'',supports_streaming:true};
  if(job.parse_mode)media.parse_mode=job.parse_mode;
  const request={chat_id:job.destination,message_id:job.targetMessageId,media};
  if(job.reply_markup)request.reply_markup=job.reply_markup;
  const msg=await botCall(native,api,'editMessageMedia',request,22000);
  if(!mediaOK(msg))throw Error('editMessageMedia_returned_no_video');
  return {ok:true,via:video.via,message_id:job.targetMessageId};
 }catch(e){errors.push('telegram_native:'+String(e.message||e).slice(0,170))}
 // C/D. Publisher-hosted direct MP4 URL, then bounded multipart upload if the URL route fails.
 for(const u of state.urls){
  try{return await editWithUrl(native,api,job,u)}catch(e){errors.push('url:'+String(e.message||e).slice(0,110))}
  try{return await editWithUpload(native,api,job,u)}catch(e){errors.push('upload:'+String(e.message||e).slice(0,110))}
 }
 throw Error('all_video_repair_routes_failed: '+errors.slice(-5).join(' | ').slice(0,700));
}
const INCIDENT={
 schema:4,source:'https://t.me/suhebb0/47987',channel:'suhebb0',sourceId:47987,
 destination:'@maydan_alkhabar',targetMessageId:552,attempts:0,createdAt:Date.now(),nextRetry:Date.now(),
 caption:['🎙️ الميدان السوري | أصوات الميدان','','#الرقة','يناشد المواطن محمد حجو والد الطفل يحيى وزارة الصحة تشكيل لجنة تحقيق مستقلة من خارج محافظة الرقة لكشف ملابسات وفاة طفله بعد 8 أيام من إدخاله إلى المشفى الوطني، وسط اتهامات بالإهمال الطبي.','','كما طالب الجهات القضائية بمتابعة الشكوى المقدمة ومحاسبة كل من يثبت تقصيره أو مسؤوليته عن الوفاة.','','✍️ المصدر: صهيب اليعربي','🔗 المنشور الأصلي: https://t.me/suhebb0/47987','#الميدان_السوري'].join('\n'),
 reply_markup:{inline_keyboard:[[{text:'اقرأ المصدر الأصلي',url:'https://t.me/suhebb0/47987'}]]},
 errors:[],parse_mode:''
};
async function seedMissingIncident(blob,entries){
 const path=RETRY_PREFIX+'suhebb0-47987-552.json',donePath=RETRY_PREFIX+'done/voice-552.json';
 const complete=(await blob.list({prefix:donePath,limit:2})).blobs||[];
 if(complete.length)return false;
 if(entries.some(b=>b.pathname===path))return false;
 try{
  await blob.put(path,JSON.stringify({...INCIDENT,createdAt:Date.now(),nextRetry:Date.now()}),
   {access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
  return true;
 }catch(e){return false}
}
async function retryPending(native=globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch){
 if(running)return running;
 running=(async()=>{
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.BLOB_READ_WRITE_TOKEN)return {skipped:'not_configured'};
  const blob=blobAPI();if(!blob)return {skipped:'no_blob_sdk'};
  const api='https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage';
  let entries;
  try{
   entries=(await blob.list({prefix:RETRY_PREFIX,limit:100})).blobs||[];
   await seedMissingIncident(blob,entries);
   entries=(await blob.list({prefix:RETRY_PREFIX,limit:100})).blobs||[];
  }catch(e){return {skipped:'ledger_unavailable'}}
  let success=0,failed=0,scanned=0;const failures=[];
  for(const row of entries.filter(r=>!r.pathname.includes('/done/')).slice(0,2)){
   let job;try{job=await native(row.url,{signal:AbortSignal.timeout(9000)}).then(r=>r.json())}catch{continue}
   if(job.schema!==4||job.nextRetry>Date.now()||job.attempts>=12)continue;scanned++;
   try{
    const repair=await repairTarget(job,native,api);
    if(job.targetMessageId===552&&job.channel==='suhebb0'){
      await blob.put(RETRY_PREFIX+'done/voice-552.json',JSON.stringify({source:job.source,messageId:552,completedAt:new Date().toISOString(),route:repair.via}),
        {access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
    }
    await blob.del(row.url);success++;
   }catch(e){
    failed++;failures.push({sourceId:job.sourceId,target:job.targetMessageId,reason:String(e.message||e).slice(0,260)});job.attempts++;job.errors=[...(job.errors||[]).slice(-5),String(e.message||e).slice(0,130)];
    const intervals=[300000,900000,3600000,21600000,43200000,86400000];
    job.nextRetry=Date.now()+intervals[Math.min(job.attempts,intervals.length-1)];
    try{await blob.put(row.pathname,JSON.stringify(job),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60})}catch{}
   }
  }
  if(scanned)console.info('Midan video retries',{scanned,success,failed});
  const done=(await blob.list({prefix:RETRY_PREFIX+'done/voice-552.json',limit:1}).catch(()=>({blobs:[]}))).blobs||[];
  return {scanned,success,failed,done552:done.length>0,failures};
 })().finally(()=>{running=null});
 return running;
}
module.exports={install,retryPending,sourceRef,sourceMedia,repairTarget,recordPending};
