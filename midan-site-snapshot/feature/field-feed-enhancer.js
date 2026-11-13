/* Midan Field: complete public source text, media and fact/news-only recent recovery.
   Original app feed remains the baseline; recent source-verified posts are additive. */
(function(){
"use strict";if(window.__MIDAN_FIELD_RESTORE__)return;window.__MIDAN_FIELD_RESTORE__=true;
const RAW="https://raw.githubusercontent.com/ahmadalali010119991-web/Shamna-AI-Android/main/midan-site-snapshot/data/field-news-10h.json";
const TEN_HOURS=10*60*60*1000,OPINION=/(?:برأيي|في رأيي|أعتقد|أظن|افعل ما تراه|لا تمش على السنة|لا تنس|اللهم|دعاء|نصيحة)/i;
const css=document.createElement("style");
css.textContent=".voice-post .card-desc.midan-full-original{white-space:pre-wrap!important;overflow-wrap:anywhere!important;max-height:none!important;display:block!important;-webkit-line-clamp:unset!important;line-clamp:unset!important;overflow:visible!important}.voice-post .midan-source-image{display:block;position:relative;margin:18px 0 8px;background:#0b213b;border-radius:12px;overflow:hidden}.voice-post .midan-card-media-button{display:block;width:100%;padding:0;background:transparent;border:0;cursor:pointer}.voice-post .midan-card-media-button img{width:100%;max-height:530px;object-fit:contain;display:block;margin:auto}.voice-post .midan-video-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:35px;color:white;background:rgba(4,18,41,.85);border-radius:50%;width:70px;height:70px;display:grid;place-items:center;pointer-events:none}.voice-post .midan-media-label{position:absolute;top:10px;right:10px;background:#06142b;color:#fff;padding:5px 9px;border-radius:8px;font-weight:700;pointer-events:none}.midan-field-source-only{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.midan-field-source-only a{color:#f0bc55;text-decoration:none;border:1px solid #f0bc55;padding:9px 13px;border-radius:10px}.midan-field-restored{border-color:#365d78!important}";
document.head.append(css);
let all=new Map(),ready=false,lastRefresh=0,processing=false,pending=0,observer=null;
const panel=()=>document.querySelector("#voicesPanel");
function normal(url){try{const u=new URL(url);return u.protocol==="https:"?u.origin+u.pathname.replace(/\/+$/,""):""}catch{return""}}
function escape(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function valid(t){return t&&t.url&&/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/.test(t.url)&&t.fullText&&Number.isFinite(Date.parse(t.publishedAt))&&Date.now()-Date.parse(t.publishedAt)<=TEN_HOURS+900000}
function cardLink(card){const a=card.querySelector(".card-foot a[href]");return normal(a?.href||card.dataset.midanPostUrl)}
function infoDate(raw){try{return new Date(raw).toLocaleString("ar-SY",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch{return raw}}
function apply(item,card){
 if(card.dataset.midanFullSource===item.id)return;
 card.dataset.midanFullSource=item.id;card.dataset.midanPostUrl=item.url;card.dataset.midanVideo=item.video?"1":"0";
 if(item.videoUrl)card.dataset.midanVideoUrl=item.videoUrl;
 card.classList.add("midan-field-restored");
 const title=card.querySelector("h3");if(title)title.textContent=item.title;
 let p=card.querySelector(".card-desc");
 if(!p){p=document.createElement("p");const footer=card.querySelector(".card-foot");if(footer)footer.before(p);else card.append(p)}
 p.classList.add("midan-full-original");p.textContent=item.fullText;
 const source=card.querySelector(".source-name");if(source)source.textContent=item.source;
 const byline=card.querySelector(".voice-byline");if(byline)byline.textContent="✍️ "+item.author;
 const time=card.querySelector("time");if(time){time.dateTime=item.publishedAt;time.textContent=infoDate(item.publishedAt)}
 const link=card.querySelector(".card-foot a[href]");if(link){link.href=item.url;link.textContent="اقرأ المصدر الأصلي";link.target="_blank";link.rel="noopener noreferrer"}
 // If the publisher image has already been discovered by source-images, annotate that visual.
 let figure=card.querySelector(".article-source-media");
 if(!figure&&item.imageUrl){
  figure=document.createElement("figure");figure.className="article-source-media midan-source-image";
  const btn=document.createElement("button");btn.type="button";btn.className="midan-card-media-button";btn.setAttribute("aria-label",item.video?"تشغيل الفيديو داخل ميدان الخبر":"عرض الصورة داخل ميدان الخبر");
  const image=document.createElement("img");image.src=item.imageUrl;image.alt=item.video?"معاينة الفيديو الأصلي":"صورة المنشور الأصلية";image.loading="lazy";image.referrerPolicy="no-referrer";btn.append(image);
  if(item.video){const badge=document.createElement("span");badge.className="midan-video-play";badge.textContent="▶";btn.append(badge)}
  figure.append(btn);card.querySelector(".voice-byline")?.after(figure);
 }else if(figure&&item.video&&!figure.querySelector(".midan-video-play")){
  const play=document.createElement("span");play.className="midan-video-play";play.textContent="▶";figure.append(play);
 }
 if(figure&&item.video)figure.dataset.midanVideo="1";
 if(figure&&item.imageUrl){
  const img=figure.querySelector("img");if(img&&(!img.src||img.src.includes("/api/news?feature=image")))img.src=item.imageUrl;
 }
}
function create(item){
 const card=document.createElement("article");card.className="news-card voice-post";card.dataset.midanFresh="1";
 card.innerHTML='<div class="card-meta"><span class="meta-badge source">منشور من المصدر</span><time datetime="'+escape(item.publishedAt)+'">'+escape(infoDate(item.publishedAt))+'</time></div><div class="voice-byline"></div><h3></h3><p class="card-desc"></p><div class="card-foot midan-field-source-only"><span class="source-name"></span><a href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">اقرأ المصدر الأصلي</a></div>';
 apply(item,card);return card
}
function recent(card){const t=card.querySelector("time[datetime]");return t&&Date.now()-Date.parse(t.dateTime)<=TEN_HOURS+900000}
function render(){
 const p=panel();if(!p||!ready||processing)return;
 const headings=p.querySelectorAll(".voices-latest-heading");if(!headings.length)return;
 processing=true;
 try{
  const first=headings[0],end=headings[1]||null;
  const current=new Map();let n=first.nextElementSibling;const cards=[];
  while(n&&n!==end){
   const next=n.nextElementSibling;
   if(n.matches?.("article.voice-post")){cards.push(n);current.set(cardLink(n),n)}
   n=next;
  }
  for(const c of cards){
   const link=cardLink(c),item=all.get(link);
   if(item){apply(item,c);continue}
   // Last ten hours from a recovered Telegram source must pass the source-side news classifier.
   if(recent(c)&&/t\.me\/suhebb0\/\d+$/.test(link)){c.remove();continue}
   // Exclude unequivocal personal advice/opinion without suppressing uncertain reports.
   const body=c.querySelector(".card-desc")?.textContent||"";
   if(OPINION.test(body)){c.remove();continue}
  }
  const inserted=[];
  for(const item of [...all.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))){
   if(!current.has(normal(item.url))){inserted.push(create(item))}
  }
  for(const c of inserted)first.after(c);
  // Sort active latest posts by timestamp; archived records remain under archive heading.
  const latest=[];n=first.nextElementSibling;
  while(n&&n!==end){const next=n.nextElementSibling;if(n.matches?.("article.voice-post"))latest.push(n);n=next}
  latest.sort((a,b)=>Date.parse(b.querySelector("time[datetime]")?.dateTime||0)-Date.parse(a.querySelector("time[datetime]")?.dateTime||0));
  let anchor=first;for(const c of latest){if(c.previousElementSibling!==anchor)anchor.after(c);anchor=c}
 }finally{processing=false}
}
async function reload(){
 if(Date.now()-lastRefresh<200000)return;
 lastRefresh=Date.now();
 try{
  const resp=await fetch(RAW+"?v="+Math.floor(Date.now()/300000),{cache:"no-store",mode:"cors"});
  if(!resp.ok)throw new Error("source update "+resp.status);
  const d=await resp.json();
  if(d.schema!==2||!Array.isArray(d.items))throw new Error("bad source report");
  all=new Map(d.items.filter(valid).map(x=>[normal(x.url),x]));ready=true;render();
 }catch(e){console.warn("Midan field source verification temporarily unavailable",e)}
}
function start(){
 const mo=new MutationObserver(()=>{if(processing)return;clearTimeout(pending);pending=setTimeout(()=>{render();if(panel())reload()},110)});
 mo.observe(document.documentElement,{childList:true,subtree:true});
 observer=mo;reload();
 document.addEventListener("click",e=>{if(e.target.closest?.('[data-view="voices"]'))setTimeout(()=>{reload();render()},300)},true);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)reload()});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.MidanFieldRecovery={refresh:reload,render:render,getItems:()=>Array.from(all.values())};
})();