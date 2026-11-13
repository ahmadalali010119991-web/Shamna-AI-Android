/* Media clicks open an internal viewer. Only the explicit "اقرأ المصدر الأصلي" opens the publisher. */
(function(){
"use strict";if(window.MidanMediaViewer)return;
const css=document.createElement("style");
css.textContent=".midan-media-viewer[hidden]{display:none!important}.midan-media-viewer{position:fixed!important;inset:0!important;z-index:2147483620!important;background:rgba(0,5,18,.97)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:12px!important;direction:rtl!important}.midan-media-dialog{width:min(98vw,1150px);max-height:96dvh;background:#06142b;border:1px solid #f0bc55;border-radius:15px;display:flex;flex-direction:column;overflow:hidden}.midan-media-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;color:#fff;font:bold 16px system-ui}.midan-media-head button{background:#15395d;color:#fff;border:1px solid #8292a1;border-radius:9px;min-width:42px;min-height:42px;font-size:27px}.midan-media-stage{background:#020915;display:flex;align-items:center;justify-content:center;overflow:auto;min-height:120px}.midan-media-stage img{max-width:100%;max-height:78dvh;object-fit:contain}.midan-media-stage video{width:100%;max-height:78dvh;background:#000}.midan-media-stage iframe{width:100%;height:min(78dvh,700px);border:0}.midan-media-caption{color:#cddceb;font:14px system-ui;padding:9px 14px;line-height:1.6}";
document.head.append(css);
let modal,stage,caption,previous;
function ensure(){if(modal)return;modal=document.createElement("div");modal.hidden=true;modal.className="midan-media-viewer";modal.innerHTML='<div class="midan-media-dialog" role="dialog" aria-modal="true" aria-label="عرض الوسائط"><div class="midan-media-head"><strong>عرض الوسائط داخل ميدان الخبر</strong><button type="button" aria-label="إغلاق" data-mid-close>×</button></div><div class="midan-media-stage"></div><div class="midan-media-caption"></div></div>';document.body.append(modal);stage=modal.querySelector(".midan-media-stage");caption=modal.querySelector(".midan-media-caption");modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-mid-close]"))close()});document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close()})}
function close(){if(!modal)return;stage.replaceChildren();modal.hidden=true;document.body.style.removeProperty("overflow");previous?.focus?.()}
function safeLink(raw){try{const u=new URL(raw,location.href);return (u.protocol==="https:"||u.protocol==="blob:")?u.href:null}catch{return null}}
function telegramEmbed(raw){try{const u=new URL(raw);if(!["t.me","www.t.me","telegram.me"].includes(u.hostname))return null;let parts=u.pathname.split("/").filter(Boolean);if(parts[0]==="s")parts.shift();if(!/^[a-zA-Z0-9_]{5,32}$/.test(parts[0]||"")||!/^\d+$/.test(parts[1]||""))return null;return "https://t.me/"+parts[0]+"/"+parts[1]+"?embed=1&mode=tme"}catch{return null}}
function openMedia(entry){ensure();previous=document.activeElement;modal.hidden=false;document.body.style.overflow="hidden";stage.replaceChildren();caption.textContent=entry.caption||"الوسيط الأصلي للمنشور";let el;
 if(entry.kind==="video"){
  const embed=telegramEmbed(entry.postUrl),direct=safeLink(entry.direct);
  if(direct){el=document.createElement("video");el.controls=true;el.playsInline=true;el.preload="metadata";el.src=direct;el.addEventListener("error",()=>{if(embed&&!modal.hidden){const f=document.createElement("iframe");f.src=embed;f.allowFullscreen=true;f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";f.sandbox="allow-scripts allow-same-origin allow-presentation";stage.replaceChildren(f)}else caption.textContent="تعذر تشغيل الفيديو من رابط المصدر."},{once:true})}
  else if(embed||entry.embed){el=document.createElement("iframe");el.src=entry.embed||embed;el.allowFullscreen=true;el.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";el.referrerPolicy="strict-origin-when-cross-origin";el.sandbox="allow-scripts allow-same-origin allow-presentation"}
  else{caption.textContent="لا يتوفر رابط تشغيل لهذا الفيديو بعد؛ الصورة المعروضة هي صورة معاينته.";entry.kind="image"}
 }
 if(entry.kind==="image"){let url=safeLink(entry.image);if(!url)return close();el=document.createElement("img");el.src=url;el.alt="صورة المنشور الأصلية";el.referrerPolicy="no-referrer"}
 stage.append(el);modal.querySelector("[data-mid-close]").focus()
}
const videoMemo=new Map();
async function resolveArticleVideo(id){
 if(!id)return null;
 if(videoMemo.has(id))return videoMemo.get(id);
 const task=fetch("/api/news?videoFor="+encodeURIComponent(id),{cache:"no-store",signal:AbortSignal.timeout(9000)})
 .then(r=>r.ok?r.json():null).then(d=>d?.ok&&["mp4","embed"].includes(d.kind)?d:null).catch(()=>null);
 videoMemo.set(id,task);return task
}
async function inspect(e){
 const target=e.target;
 const hit=target.closest?.(".article-source-media a,.article-source-media button,.article-source-media img,.article-source-media video,.midan-card-media-button,.voice-post .article-source-media,.news-card .news-media img,.m-sports-card .article-source-media");
 if(!hit)return;
 const card=hit.closest(".voice-post,.news-card,.m-sports-card,#modalContent")||hit.closest(".article-source-media")?.parentElement;
 const figure=hit.closest(".article-source-media")||hit;
 const img=hit.tagName==="IMG"?hit:figure.querySelector?.("img");
 const video=figure.querySelector?.("video")||(hit.tagName==="VIDEO"?hit:null);
 const explicitLink=card?.querySelector(".card-foot a[href],.m-sports-source[href],.detail-source a[href]")?.href;
 const postUrl=card?.dataset?.midanPostUrl||explicitLink||hit.closest("a[href]")?.href||null;
 if(!img&&!video)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 const clip=card?.dataset?.midanVideo==="1"||!!video||/(?:فيديو|مقطع مصور|شاهد الفيديو)/i.test(card?.textContent?.slice(0,350)||"");
 const embed=telegramEmbed(postUrl);
 const originalId=card?.dataset?.article||card?.querySelector?.("[data-save]")?.getAttribute("data-save");
 let remoteVideo=null;
 if(originalId&&!clip)remoteVideo=await resolveArticleVideo(originalId);
 if(remoteVideo&&["mp4","embed"].includes(remoteVideo.kind)){
   openMedia({kind:"video",direct:remoteVideo.kind==="mp4"?remoteVideo.url:null,embed:remoteVideo.kind==="embed"?remoteVideo.url:null,postUrl,caption:"فيديو الخبر الأصلي داخل ميدان الخبر"});
   return;
 }
 openMedia({kind:clip&& (video||embed)?"video":"image",direct:card?.dataset?.midanVideoUrl||video?.currentSrc||video?.src,image:img?.currentSrc||img?.src,postUrl:postUrl,caption:clip?"الفيديو الأصلي داخل ميدان الخبر":"صورة الخبر الأصلية"});
}
document.addEventListener("click",inspect,true);
window.MidanMediaViewer={open:openMedia,close,telegramEmbed};
})();