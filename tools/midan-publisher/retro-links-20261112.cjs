'use strict';
/** Restore ONLY Telegram text_link entities for source labels on archived news
 * with an exact, unique canonical article-title match in published Midan feeds.
 * No text rewriting, attachment replacement, repost, or deletion.
 */
const CHAT='@maydan_alkhabar';
const IDS=Object.freeze([111,113,115,125,126,450,462,463,467,470,471,480,481,484,486,493,494,497,498,499,500,501,502,503,505,507,510,511,512,513,514,515,517,518,519,520,521,522,523,524,525,526,527,528,529,531,532]);
const ENDPOINTS=['https://midan-al-khabar.vercel.app/api/news','https://midan-al-khabar.vercel.app/api/citizen?voices=public'];
const BATCH=4;
const normal=s=>String(s||'').normalize('NFKC').replace(/[\u064b-\u065f\u200e\u200f\u0640]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();
const decode=s=>String(s||'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#(\d+)|#x([0-9a-f]+));/gi,(full,d,h)=>{
 if(d)return String.fromCodePoint(+d);
 if(h)return String.fromCodePoint(parseInt(h,16));
 return {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&#39;':"'",'&#x27;':"'"}[full.toLowerCase()]||full;
});
function parseHtml(html){
 let text='',entities=[],stack=[];
 for(const token of String(html||'').match(/<[^>]+>|[^<]+/g)||[]){
  if(token[0]!=='<'){text+=decode(token);continue}
  if(/^<br\b/i.test(token)){text+='\n';continue}
  const opening=token.match(/^<(a|b|strong|i|em|u|s|code)\b/i);
  if(opening){
   const tag=opening[1].toLowerCase(),key=tag==='strong'?'bold':tag==='b'?'bold':tag==='i'?'italic':tag==='em'?'italic':tag==='u'?'underline':tag==='s'?'strikethrough':tag==='code'?'code':'text_link';
   if(tag==='i'&&/class=["']emoji\b/i.test(token)){stack.push({tag,type:null,start:text.length});continue}
   const href=token.match(/href=["']([^"']+)["']/i)?.[1];
   let url=null;if(tag==='a')try{let u=new URL(decode(href||''));if(['https:','http:'].includes(u.protocol))url=u.href}catch{}
   stack.push({tag,type:key,start:text.length,url});continue;
  }
  const closing=token.match(/^<\/(a|b|strong|i|em|u|s|code)\b/i);
  if(closing){
   const tag=closing[1].toLowerCase();let i=stack.map(x=>x.tag).lastIndexOf(tag);
   if(i<0)continue;
   const opened=stack.splice(i,1)[0],len=text.length-opened.start;
   if(!opened.type||len<=0)continue;
   const ent={type:opened.type,offset:opened.start,length:len};
   if(opened.type==='text_link'){if(!opened.url)continue;ent.url=opened.url}
   entities.push(ent);
  }
 }
 return {text,entities:entities.sort((a,b)=>a.offset-b.offset)};
}
function extract(html,id){
 const p=html.indexOf('data-post="maydan_alkhabar/'+id+'"');if(p<0)throw Error('Public message missing: '+id);
 const block=html.slice(p,p+20000).split('tgme_widget_message_wrap')[0];
 const content=(block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)||[])[1];
 if(!content)throw Error('Public caption/text not found: '+id);
 return {content,media:/tgme_widget_message_photo|tgme_widget_message_video|tgme_widget_message_document|tgme_widget_message_animation/.test(block)};
}
async function urls(){
 let out=[];
 for(const endpoint of ENDPOINTS){
  const r=await fetch(endpoint,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Canonical feed unavailable');
  const data=await r.json();
  out.push(...(data.articles||[]),...(data.items||[]),...(data.archive||[]));
 }
 return out.filter(x=>x.url&&normal(x.title).length>=25)
  .map(x=>({title:normal(x.title),url:x.url}));
}
function exactSource(msg,list){
 const t=normal(msg);
 const matches=[...new Set(list.filter(x=>t.includes(x.title)).map(x=>x.url))];
 return matches.length===1?matches[0]:null;
}
function linked(ent,label,text){
 return ent.some(x=>x.type==='text_link'&&text.slice(x.offset,x.offset+x.length)===label);
}
function prepare(id,html,articles){
 const {content,media}=extract(html,id),result=parseHtml(content),source=exactSource(result.text,articles);
 if(!source)return {id,status:'unmatched'};
 let added=0;
 for(const match of result.text.matchAll(/🔗\s*(المنشور الأصلي|المصدر)(?=\s|$|[،.#])/gu)){
  const label=match[1],offset=match.index+match[0].lastIndexOf(label);
  if(result.entities.some(x=>x.offset<=offset&&x.offset+x.length>=offset+label.length))continue;
  result.entities.push({type:'text_link',offset,length:label.length,url:source});added++;
 }
 if(!added)return {id,status:'already_linked'};
 if(!result.text||result.text.length>(media?1024:4096))return {id,status:'caption_too_long'};
 const url=new URL(source);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid canonical source');
 return {id,status:'ready',media,text:result.text,entities:result.entities.sort((a,b)=>a.offset-b.offset),url:source,added};
}
async function patchOne(token,id,articles){
 const r=await fetch('https://t.me/maydan_alkhabar/'+id+'?embed=1&sourceRepair='+Date.now(),{
  headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error('Public original post unavailable');
 const item=prepare(id,await r.text(),articles);
 if(item.status!=='ready')return {id,status:item.status};
 const body={chat_id:CHAT,message_id:id};
 const method=item.media?'editMessageCaption':'editMessageText';
 body[item.media?'caption':'text']=item.text;
 body[item.media?'caption_entities':'entities']=item.entities;
 // Preserve the existing in-app button behavior.
 body.reply_markup={inline_keyboard:[[{text:'📲 افتح الخبر في ميدان الخبر',url:'https://midan-al-khabar.vercel.app/open.html?source='+encodeURIComponent(item.url)}]]};
 const reply=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(22000)});
 const out=await reply.json().catch(()=>({ok:false,description:'Invalid Telegram API JSON'}));
 if(!out.ok||out.result?.message_id&&out.result.message_id!==id)throw Error('Telegram rejected '+id+': '+String(out.description||reply.status).slice(0,110));
 return {id,status:'edited',media:item.media,added:item.added};
}
module.exports=async function backfill(req,res){
 res.setHeader('Cache-Control','no-store');
 const token=process.env.TELEGRAM_BOT_TOKEN;
 const batch=Number(req.query?.batch);
 if(!token)return res.status(503).json({ok:false,error:'Telegram not configured'});
 if(!Number.isInteger(batch)||batch<0||batch>=Math.ceil(IDS.length/BATCH))
  return res.status(400).json({ok:false,error:'Unknown fixed batch'});
 let list;try{list=await urls()}catch(e){return res.status(503).json({ok:false,error:String(e.message)})}
 const result=[];
 for(const id of IDS.slice(batch*BATCH,(batch+1)*BATCH)){
  try{result.push(await patchOne(token,id,list))}catch(e){result.push({id,status:'error',error:String(e.message).slice(0,140)})}
 }
 const ok=result.every(x=>['edited','already_linked'].includes(x.status));
 return res.status(ok?200:207).json({ok,batch,result});
};
module.exports.IDS=IDS;module.exports.parseHtml=parseHtml;module.exports.prepare=prepare;module.exports.exactSource=exactSource;module.exports.extract=extract;
