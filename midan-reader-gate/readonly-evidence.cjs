'use strict';
// Read-only MTProto evidence. No bot credentials, publishing methods or persistent writes.
const canonical=(x)=>{if(typeof x!=='string')return null;const m=x.match(/^https:\/\/t\.me\/(?:s\/)?([A-Za-z0-9_]{5,32})\/([1-9][0-9]{0,12})(?:[?#].*)?$/);return m?{channel:m[1].toLowerCase(),id:Number(m[2])}:null;};
const numeric=x=>{try{const s=String(x);return /^[1-9][0-9]{0,20}$/.test(s)?s:null;}catch{return null;}};
const kind=x=>x?.className||x?.constructor?.className||'';
const UNKNOWN=reason=>({status:'unknown',reason});
function approved(ref,role,registry){
 if(!ref||!['source','destination'].includes(role)||typeof ref.channel!=='string'||!Number.isSafeInteger(ref.id)||ref.id<1)return null;
 const c=canonical(ref.url);if(!c||c.channel!==ref.channel.toLowerCase()||c.id!==ref.id)return null;
 const row=Array.isArray(registry)&&registry.find(x=>x&&x.channel===c.channel&&Array.isArray(x.roles)&&x.roles.includes(role));
 const pin=numeric(row?.peerId);return pin?{...c,pin}:null;
}
async function inspect(client,ref,role,registry){
 const q=approved(ref,role,registry);if(!q)return UNKNOWN('UNAPPROVED_OR_UNPINNED');
 try{
  const peer=await client.getInputEntity(q.channel);
  if(kind(peer)!=='InputPeerChannel'||numeric(peer.channelId)!==q.pin)return UNKNOWN('PEER_MISMATCH');
  const rows=await client.getMessages(peer,{ids:[q.id]});
  if(!Array.isArray(rows)||rows.length!==1)return UNKNOWN('EXACT_MESSAGE_UNAVAILABLE');
  const m=rows[0];if(!m||kind(m)==='MessageEmpty'||m.id!==q.id||kind(m.peerId)!=='PeerChannel'||numeric(m.peerId.channelId)!==q.pin)return UNKNOWN('EXACT_MESSAGE_UNAVAILABLE');
  const media=m.media;
  if(media==null||kind(media)==='MessageMediaEmpty')return {status:'confirmed-no-video',channel:q.channel,peerId:q.pin,messageId:q.id};
  if(kind(media)==='MessageMediaPhoto'&&kind(media.photo)==='Photo'&&numeric(media.photo.id))return {status:'confirmed-no-video',channel:q.channel,peerId:q.pin,messageId:q.id};
  if(kind(media)!=='MessageMediaDocument'||kind(media.document)!=='Document')return UNKNOWN('UNRECOGNIZED_MEDIA');
  const doc=media.document,documentId=numeric(doc.id);
  const attrs=Array.isArray(doc.attributes)?doc.attributes:[];
  const videoAttr=attrs.some(a=>kind(a)==='DocumentAttributeVideo');
  // A video MIME or attribute on its own is not enough to establish absence or identity.
  if(!documentId||typeof doc.mimeType!=='string'||!/^video\//i.test(doc.mimeType)||!videoAttr)return UNKNOWN('DOCUMENT_NOT_CONFIRMED_VIDEO');
  const size=Number(doc.size);if(!Number.isSafeInteger(size)||size<1)return UNKNOWN('INVALID_DOCUMENT_SIZE');
  return {status:'confirmed-video',channel:q.channel,peerId:q.pin,messageId:q.id,documentId,bytes:size,forwardRestricted:!!m.noforwards};
 }catch{return UNKNOWN('READ_FAILED');}
}
module.exports={canonical,approved,inspect};