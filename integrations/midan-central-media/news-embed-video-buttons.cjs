'use strict';
/**
 * Attach an official video WATCH button to existing owner-channel news posts.
 * YouTube embeds are not MP4 files; do not send them through sendVideo and do
 * not download copyrighted video. Preserve every existing inline button and
 * update the original message's markup without creating duplicate messages.
 */
const SITE='https://midan-al-khabar.vercel.app';
const CHANNEL='maydan_alkhabar';
function decodeAttr(x){return String(x||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'")}
function safeUrl(x){
 try{const u=new URL(decodeAttr(x));return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:null}catch{return null}
}
function videoWatchUrl(meta){
 if(!meta||meta.ok!==true||meta.kind!=='embed')return null;
 let u;try{u=new URL(meta.url)}catch{return null}
 if(u.protocol!=='https:'||u.hostname!=='www.youtube-nocookie.com'||u.search||u.hash)return null;
 const m=u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})$/);
 return m?'https://www.youtube.com/watch?v='+m[1]:null;
}
function extractBlocks(html){
 return String(html||'').split(/<div class="tgme_widget_message_wrap\b/).slice(1)
 .map(block=>{
  const m=block.match(/\bdata-post="maydan_alkhabar\/([1-9]\d*)"/);
  return m?{id:Number(m[1]),html:block}:null;
 }).filter(Boolean);
}
function articleUrl(article){return safeUrl(article?.sourceUrl||article?.url)}
function sameSourcePost(block,url){
 return [...block.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)]
  .some(x=>safeUrl(x[1])===url);
}
function parseButtons(block){
 const out=[];
 for(const match of block.matchAll(/<a\b[^>]*class="[^"]*\btgme_widget_message_inline_button\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)){
  const tag=match[0],href=tag.match(/\bhref="([^"]+)"/)?.[1];
  const url=safeUrl(href);
  if(!url)continue;
  const label=decodeAttr(tag.match(/<span[^>]*tgme_widget_message_inline_button_text[^>]*>([\s\S]*?)<\/span>/)?.[1]||'')
   .replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
  if(label&&label.length<=64)out.push({text:label,url});
 }
 return out;
}
async function getJSON(fetcher,url,opts={}){
 const r=await fetcher(url,{...opts,signal:AbortSignal.timeout(13000)});
 if(!r.ok)throw Error('HTTP_'+r.status);
 return r.json();
}
async function repair({fetcher=globalThis.__MIDAN_NEWS_RAW_FETCH||globalThis.fetch,
 token=process.env.TELEGRAM_BOT_TOKEN,chatId='@maydan_alkhabar',maxEdits=3}={}){
 if(!token)return {skipped:'telegram_token_unavailable'};
 if(chatId!=='@maydan_alkhabar')throw Error('UNEXPECTED_CHANNEL');
 const news=await getJSON(fetcher,SITE+'/api/news');
 const articles=(news.articles||[]).filter(a=>a.sourceId==='france24-ar'&&articleUrl(a));
 const output={scanned:0,matched:0,updated:[],already:[],errors:[]};
 let before=null,seen=new Set();
 for(let page=0;page<3;page++){
  const query=before?'?before='+before:'';
  const r=await fetcher('https://t.me/s/'+CHANNEL+query,{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(13000)});
  if(!r.ok)throw Error('CHANNEL_HTML_'+r.status);
  const blocks=extractBlocks((await r.text()).slice(0,2200000));
  const ids=blocks.map(x=>x.id);
  if(!ids.length)break;
  for(const b of blocks){
   if(seen.has(b.id))continue;
   seen.add(b.id);output.scanned++;
   const article=articles.find(a=>sameSourcePost(b.html,articleUrl(a)));
   if(!article)continue;
   output.matched++;
   const originalButtons=parseButtons(b.html);
   if(originalButtons.some(x=>x.text.includes('شاهد الفيديو'))) {output.already.push(b.id);continue}
   // Never remove previously configured UI markup just to add an embed.
   if(!originalButtons.length){output.errors.push({id:b.id,reason:'existing_buttons_not_parsed'});continue}
   const video=await getJSON(fetcher,SITE+'/api/news?videoFor='+encodeURIComponent(article.id));
   const watch=videoWatchUrl(video);
   if(!watch||safeUrl(video.source)!==articleUrl(article))continue;
   if(output.updated.length>=maxEdits)continue;
   const markup={inline_keyboard:[[{text:'🎬 شاهد الفيديو الأصلي',url:watch}],originalButtons]};
   const post=await fetcher('https://api.telegram.org/bot'+token+'/editMessageReplyMarkup',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,message_id:b.id,reply_markup:markup}),
    signal:AbortSignal.timeout(15000)
   });
   const response=await post.json().catch(()=>({}));
   if(post.ok&&response.ok===true){output.updated.push({messageId:b.id,articleId:article.id,watchUrl:watch})}
   else output.errors.push({id:b.id,reason:String(response.description||post.status).slice(0,130)});
  }
  const next=Math.min(...ids);
  if(next===before||output.updated.length>=maxEdits)break;
  before=next;
 }
 return output;
}
module.exports={repair,videoWatchUrl,parseButtons,sameSourcePost,extractBlocks};
