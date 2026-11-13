'use strict';
/**
 * Staged adapter for already-public, allowlisted @Private_Source99 posts.
 * Converts a canonical /api/news article into the media pipeline input.
 * Existing editorial controls still decide publishing; this function does NOT
 * silently set editorialApproved=true.
 */
const {normalize}=require('./media-contract.cjs');
function usableTitle(article){
 const t=String(article.title||'').replace(/\s+/g,' ').trim();
 if(t)return t.slice(0,180);
 const s=String(article.summary||'').replace(/#[\p{L}\p{N}_]+/gu,' ')
  .replace(/\s+/g,' ').trim();
 return s.slice(0,180);
}
function normalizeSource99Article(raw){
 if(!raw||raw.sourceId!=='private-source99'||!/^private-source99-\d+$/.test(String(raw.id||'')))
  throw Error('SOURCE99_NOT_AUTHORIZED');
 const expected='https://t.me/Private_Source99/'+raw.id.split('-').at(-1);
 if(raw.sourceUrl!==expected||raw.originalPostUrl!==expected)
  throw Error('SOURCE99_PROVENANCE_MISMATCH');
 const title=usableTitle(raw);
 if(!title)throw Error('SOURCE99_EMPTY_ARTICLE');
 const mediaKind=raw.hasOriginalVideo===true?'video':raw.hasOriginalPhoto===true?'photo':'text';
 const event=normalize({id:raw.id,title,summary:raw.summary||'',sourceUrl:expected,mediaKind,
  media:Array.isArray(raw.media)?raw.media:[]});
 return {
  article:event,
  approved:raw.editorialApproved===true,
  approvalRequired:raw.editorialApproved!==true,
  sourceId:raw.sourceId,
  originalPostUrl:expected,
  mediaPending:mediaKind!=='text'&&event.media.length===0
 };
}
module.exports={normalizeSource99Article,usableTitle};
