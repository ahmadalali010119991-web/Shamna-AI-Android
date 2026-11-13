'use strict';
/**
 * Trusted owner-controlled public feed @Private_Source99.
 * No editorial review, country/category, importance, or content gating.
 * Sole publication eligibility rule: the original post must not already exist.
 * Provenance and required technical media handling are integrity checks,
 * never editorial approval controls.
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
 const title=usableTitle(raw)||'خبر من المصدر الخاص';
 const mediaKind=raw.hasOriginalVideo===true?'video':raw.hasOriginalPhoto===true?'photo':'text';
 const event=normalize({id:raw.id,title,summary:raw.summary||'',sourceUrl:expected,mediaKind,
  media:Array.isArray(raw.media)?raw.media:[]});
 return {
  article:event,
  approved:true,
  approvalRequired:false,
  bypassEditorialGates:true,
  publicationPolicy:'source99-deduplicate-only',
  sourceId:raw.sourceId,
  originalPostUrl:expected,
  mediaPending:mediaKind!=='text'&&event.media.length===0
 };
}
/**
 * exists MUST be a durable exact-match lookup of the canonical source post URL.
 * All callers must use the same dedup ledger for website + Telegram.
 */
async function admitSource99Article(raw,{exists}={}){
 if(typeof exists!=='function')throw Error('DURABLE_DUPLICATE_CHECK_REQUIRED');
 const imported=normalizeSource99Article(raw);
 const duplicate=await exists(imported.originalPostUrl);
 if(typeof duplicate!=='boolean')throw Error('DUPLICATE_CHECK_UNCONFIRMED');
 return {...imported,shouldPublish:!duplicate,duplicate};
}
module.exports={normalizeSource99Article,admitSource99Article,usableTitle};
