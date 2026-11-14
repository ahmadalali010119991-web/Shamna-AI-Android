'use strict';
/** Strict, side-effect-free media contract for the Midan/Telegram bridge. */
const crypto = require('node:crypto');
const ALLOWED = new Set(['text','photo','video','album']);
function isPublicHttps(v) {
 try {
  const u = new URL(v);
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
   u.hostname.includes('.') && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname);
 } catch {return false}
}
function normalize(raw) {
 if (!raw || typeof raw !== 'object') throw Error('EVENT_REQUIRED');
 const id = String(raw.id||'');
 const mediaKind = String(raw.mediaKind||'text');
 if(!/^[A-Za-z0-9:_-]{1,150}$/.test(id))throw Error('INVALID_ID');
 if(!ALLOWED.has(mediaKind))throw Error('INVALID_KIND');
 if(!isPublicHttps(raw.sourceUrl))throw Error('INVALID_SOURCE');
 if(!String(raw.title||'').trim())throw Error('TITLE_REQUIRED');
 return {id,mediaKind,title:String(raw.title).trim(),summary:String(raw.summary||''),
  sourceUrl:String(raw.sourceUrl),media:Array.isArray(raw.media)?raw.media.slice(0,30):[]};
}
function identity(event) {
 return crypto.createHash('sha256').update(event.id+'\0'+event.sourceUrl).digest('hex');
}
function publishDecision(event,{videoVerified=false,photoVerified=false,recoveryExhausted=false,hasPendingRetries=false}={}) {
 const kind=event.mediaKind;
 if(kind==='text') return {kind:'text',status:'ready'};
 if(kind==='video'){
  if(videoVerified)return {kind:'video',status:'ready'};
  if(recoveryExhausted&&!hasPendingRetries&&photoVerified)return {kind:'photo',status:'original-photo-fallback'};
  return {kind:null,status:'awaiting-video'};
 }
 if(kind==='photo')return photoVerified?{kind:'photo',status:'ready'}:{kind:null,status:'awaiting-photo'};
 return {kind:null,status:'awaiting-album-validation'};
}
function mergeDestinations(previous={},updates={}) {
 const result={website:previous.website||{status:'pending'},telegram:previous.telegram||{status:'pending'}};
 for(const target of ['website','telegram']) {
  const update=updates[target];if(!update)continue;
  if(result[target].status==='sent')continue;
  if(update.status==='sent' && !update.externalId)throw Error('MISSING_DESTINATION_CONFIRMATION');
  result[target]={...update};
 }
 return result;
}
module.exports={normalize,identity,publishDecision,mergeDestinations,isPublicHttps};
