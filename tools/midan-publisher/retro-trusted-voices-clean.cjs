'use strict';
/**
 * Limited source-verified edit of already posted trusted-voice notices.
 * Read current public Telegram message text, preserve attachments and URL entities,
 * remove the publisher's metadata "📌 متداول" only; never delete or repost.
 */
const CHAT='@maydan_alkhabar';
const IDS=Object.freeze([97,98,131,134,135,155,156,159,162,179,194,198,233,235,236,292,294,302,324,446,447,449,452,454,485,488,489,502,503,506,507,522,526]);
const SOURCES=Object.freeze(['عهد الصليبي','صهيب الجابر','زين العابدين العكيدي','صهيب اليعربي','أمجد الساري','إبراهيم الحبش']);
const BATCH=4;
function htmlDecode(s){
 return String(s||'').replace(/&(?:amp|quot|lt|gt|apos|nbsp|#39|#x27|#(\d+)|#x([0-9a-f]+));/gi,(full,d,h)=>{
  if(d)return String.fromCodePoint(+d);
  if(h)return String.fromCodePoint(parseInt(h,16));
  return {'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&apos;':"'",'&nbsp;':' ','&#39;':"'",'&#x27;':"'"}[full.toLowerCase()]||full;
 });
}
function trustedSource(html){
 const pure=htmlDecode(String(html||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ');
 return SOURCES.find(name=>new RegExp('(?:المصدر|الناشط)\\s*[:：]\\s*'+name+'(?=\\s|$|[🔗📌#])','u').test(pure))||null;
}
function removeTag(html){
 const noEmoji=String(html).replace(/<i\b[^>]*class=["']emoji["'][^>]*>\s*<b>📌<\/b>\s*<\/i>\s*متداول(?:\s*<br\s*\/?>)?/giu,'');
 return noEmoji.replace(/[ \t]*📌[ \t]*#?متداول(?:\s*<br\s*\/?>)?/gu,'')
  .replace(/(?:^|<br\s*\/?>)\s*#?متداول(?=\s*(?:<br\s*\/?>|$))/giu,'');
}
function render(html){
 let text='',links=[],stack=[],tokens=String(html).match(/<[^>]+>|[^<]+/g)||[];
 for(const tok of tokens){
  if(tok[0]!=='<'){text+=htmlDecode(tok);continue}
  if(/^<br\b/i.test(tok)){text+='\n';continue}
  if(/^<a\b/i.test(tok)){
   const href=tok.match(/\bhref=["']([^"']+)["']/i)?.[1];
   const decoded=htmlDecode(href||'');
   let url=null;
   try{const parsed=new URL(decoded);if(parsed.protocol==='https:'||parsed.protocol==='http:')url=parsed.href}catch{}
   stack.push({offset:text.length,url});
  }else if(/^<\/a\s*>/i.test(tok)){
   const a=stack.pop();if(a?.url&&text.length>a.offset)links.push({type:'text_link',offset:a.offset,length:text.length-a.offset,url:a.url});
  }
 }
 // Avoid changes to public paragraph layout except the removed circulation tag.
 text=text.replace(/\n{3,}/g,'\n\n').trim();
 // Telegram entities must refer to the original text offsets; leading trims are
 // safe only if no links precede the first non-whitespace character.
 return {text,entities:links.filter(e=>e.offset+e.length<=text.length)};
}
function extract(html,id){
 const pos=html.indexOf('data-post="maydan_alkhabar/'+id+'"');
 if(pos<0)throw Error('Message '+id+' not found');
 const block=html.slice(pos,pos+18000).split('tgme_widget_message_wrap')[0];
 const content=(block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)||[])[1];
 if(!content)throw Error('Message '+id+' has no public text');
 return {block,content,media:/tgme_widget_message_photo|tgme_widget_message_video|tgme_widget_message_document|tgme_widget_message_animation/.test(block)};
}
async function telegram(token,method,body){
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await r.json().catch(()=>({ok:false,description:'Invalid Telegram JSON'}));
 return {http:r.status,...data};
}
async function fetchCurrent(id){
 const r=await fetch('https://t.me/s/maydan_alkhabar?before='+(id+1)+'&fixCirculation='+Date.now(),{
   cache:'no-store',signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Could not verify public message '+id);
 const h=await r.text();if(h.length>1500000)throw Error('Telegram page too large');
 return extract(h,id);
}
function prepare(id,item){
 const {content,media}=item;
 if(!trustedSource(content))throw Error('No explicitly attributed trusted activist on message '+id);
 if(!/متداول/u.test(htmlDecode(content)))return {id,status:'already_clean'};
 const fixed=removeTag(content);
 if(fixed===content)throw Error('Unrecognized circulation-tag layout for '+id);
 const before=render(content),after=render(fixed);
 if(after.text.includes('متداول'))throw Error('Circulation tag remained in message '+id);
 if(!after.text.includes('المصدر'))throw Error('Source attribution lost in '+id);
 if(!after.text.trim())throw Error('Empty output message '+id);
 if(after.text.length>(media?1024:4096))throw Error('Corrected text exceeds Telegram limit for '+id);
 // Do not allow editorial rewriting of the article body, only metadata removal.
 const a=before.text.replace(/📌\s*#?متداول/gu,' ').replace(/\s+/g,' ').trim();
 const b=after.text.replace(/\s+/g,' ').trim();
 if(a!==b)throw Error('Changes beyond circulation tag detected for '+id);
 return {id,status:'ready',media,text:after.text,entities:after.entities};
}
async function one(token,id){
 const current=await fetchCurrent(id),item=prepare(id,current);
 if(item.status==='already_clean')return {id,status:item.status};
 const method=item.media?'editMessageCaption':'editMessageText';
 const payload={chat_id:CHAT,message_id:id};
 payload[item.media?'caption':'text']=item.text;
 payload[item.media?'caption_entities':'entities']=item.entities;
 const answer=await telegram(token,method,payload);
 if(!answer.ok)throw Error('Telegram '+method+' rejected '+id+': '+String(answer.description||answer.http).slice(0,95));
 if(!answer.result||Number(answer.result.message_id)!==id)throw Error('Telegram did not return the original message ID');
 return {id,status:'edited',media:item.media,source:trustedSource(current.content)};
}
module.exports=async function retro(req,res){
 res.setHeader('Cache-Control','no-store');
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,error:'Telegram not configured'});
 const batch=Number(req.query?.batch);
 if(!Number.isInteger(batch)||batch<0||batch>=Math.ceil(IDS.length/BATCH))return res.status(400).json({ok:false,error:'Invalid fixed batch'});
 const range=IDS.slice(batch*BATCH,(batch+1)*BATCH),results=[];
 for(const id of range){try{results.push(await one(token,id))}catch(e){results.push({id,status:'not_edited',error:String(e.message).slice(0,140)})}}
 const ok=results.every(x=>x.status==='edited'||x.status==='already_clean');
 return res.status(ok?200:207).json({ok,batch,results});
};
module.exports.IDS=IDS;module.exports.prepare=prepare;module.exports.render=render;module.exports.removeTag=removeTag;module.exports.trustedSource=trustedSource;
