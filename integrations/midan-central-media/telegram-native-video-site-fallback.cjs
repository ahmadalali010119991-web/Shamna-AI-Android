'use strict';
/**
 * Website-only fallback: no uploads or permanent binary storage.
 * Use an existing PUBLIC native Telegram video message iff its news source
 * hyperlink EXACTLY matches the canonical published article source.
 * Anonymous public Telegram embed remains available as long as the Telegram
 * channel post exists. No invented filenames, no duplicate Telegram posts.
 */
const CHANNEL='maydan_alkhabar';
const MAX_PAGES=5;
const MAX_HTML=2_500_000;
const cache=new Map();
function safeCanonical(input){
 try{
  const u=new URL(String(input||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  u.hash='';u.searchParams.sort();
  // Preserve article slugs and query values, normalize only URL syntax.
  return u.href;
 }catch{return null}
}
function videoMessageId(block){
 const m=block.match(/\bdata-post="maydan_alkhabar\/([1-9]\d{0,11})"/);
 if(!m)return null;
 // Never infer video from a mere YouTube link, photo or page heading.
 if(!/tgme_widget_message_video|tgme_widget_message_roundvideo|<video\b/i.test(block))return null;
 return m[1];
}
function exactSourceLink(block,source){
 const expected=safeCanonical(source);
 if(!expected)return false;
 for(const m of block.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)){
  const v=m[1].replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'");
  if(safeCanonical(v)===expected)return true;
 }
 return false;
}
function parseMatchingPost(html,source){
 for(const block of String(html||'').split(/<div class="tgme_widget_message_wrap\b/).slice(1)){
  const id=videoMessageId(block);
  if(id&&exactSourceLink(block,source))
   return {kind:'embed',url:'https://t.me/'+CHANNEL+'/'+id+'?embed=1',
    transport:'telegram_channel',channelMessageId:Number(id)};
 }
 return null;
}
async function resolve(source,{fetcher=fetch,pages=MAX_PAGES}={}){
 const canonical=safeCanonical(source);
 if(!canonical)return null;
 const cached=cache.get(canonical);
 if(cached&&Date.now()-cached.at<20000)return cached.value;
 const count=Math.min(Math.max(1,Number(pages)||1),MAX_PAGES);
 let before=null,matched=null;
 for(let i=0;i<count;i++){
  const url='https://t.me/s/'+CHANNEL+(before?'?before='+before:'');
  let r;
  try{r=await fetcher(url,{method:'GET',redirect:'manual',
   headers:{accept:'text/html','user-agent':'Mozilla/5.0 MidanMediaVerifier/1.0'},
   signal:AbortSignal.timeout(8500)})}catch{break}
  if(!r||r.status!==200||r.redirected)break;
  const contentType=String(r.headers?.get?.('content-type')||'text/html').toLowerCase();
  if(!contentType.includes('text/html'))break;
  const html=(await r.text()).slice(0,MAX_HTML);
  matched=parseMatchingPost(html,canonical);
  if(matched)break;
  const ids=[...html.matchAll(/\bdata-post="maydan_alkhabar\/([1-9]\d*)"/g)]
   .map(x=>Number(x[1])).filter(Number.isSafeInteger);
  if(!ids.length)break;
  const next=Math.min(...ids);
  if(next===before)break;
  before=next;
 }
 const value=matched;
 if(cache.size>250)cache.clear();
 cache.set(canonical,{at:Date.now(),value});
 return value;
}
module.exports={resolve,safeCanonical,videoMessageId,exactSourceLink,parseMatchingPost};
