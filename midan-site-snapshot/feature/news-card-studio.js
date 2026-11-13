/* Midan News Card Studio v1 — additive, no modifications to existing news code. */
(function(){
"use strict";
if(window.MidanNewsCardStudioLoaded)return;
window.MidanNewsCardStudioLoaded=true;
var BRAND="ميدان الخبر",HANDLE="@maydan_alkhabar",FORMATS={portrait:[1080,1350],square:[1080,1080],story:[1080,1920],wide:[1600,900]};
var style=document.createElement("style");style.id="mcs-styles";
style.textContent=".mcs-create{background:#0a2d60!important;color:#f0bc55!important;border:1px solid #f0bc55!important;border-radius:10px!important;padding:9px 13px!important;margin:9px 0!important;cursor:pointer!important;font:700 14px system-ui!important;display:inline-flex!important;align-items:center!important;gap:8px!important}.mcs-modal[hidden]{display:none!important}.mcs-modal{position:fixed!important;inset:0!important;z-index:2147483640!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:12px!important;direction:rtl!important}.mcs-shade{position:absolute;inset:0;background:rgba(0,0,0,.82)}.mcs-box{position:relative;z-index:1;width:min(96vw,620px);max-height:94dvh;overflow-y:auto;padding:18px;background:#06142b;color:#f4f7fc;border:1px solid #f0bc55;border-radius:20px;box-shadow:0 25px 75px #0009;font-family:system-ui,Tahoma,sans-serif}.mcs-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.mcs-close{background:transparent;border:0;color:#fff;font-size:31px;cursor:pointer}.mcs-control{display:flex;gap:12px;align-items:center;margin:16px 0}.mcs-control select{flex:1;min-width:0;background:#0a2d60;color:#fff;padding:10px;border:1px solid #567;border-radius:9px}.mcs-preview{display:block;width:100%;max-height:57dvh;object-fit:contain;background:#091c37;border-radius:12px}.mcs-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}.mcs-actions button{flex:1;min-width:120px;background:#f0bc55;color:#06142b;border:0;border-radius:11px;padding:13px;font:700 15px system-ui;cursor:pointer}.mcs-actions button:disabled{opacity:.6}.mcs-msg{min-height:1.4em;color:#f0bc55;font-size:13px;line-height:1.7}.mcs-note{font-size:12px;color:#c7d1df}";
document.head.appendChild(style);
function clean(s){var t=String(s||"");for(var i=0;i<4;i++){var n=t.replace(/&amp;/gi,"&").replace(/&(?:rlm|lrm|zwnj|zwj);|&#(?:x(?:200e|200f|202a|202b|202c|202d|202e|2066|2067|2068|2069)|8206|8207);/gi,"");if(n===t)break;t=n;}return t.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function loadImage(url){return new Promise(function(resolve,reject){if(!url)return resolve(null);var img=new Image();img.crossOrigin="anonymous";img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error("تعذّر استخدام صورة المصدر بسبب سياسة الحماية؛ استُخدم التصميم النصي."))};img.src=url})}
function wrap(ctx,str,width,limit){var words=str.split(/\s+/).filter(Boolean),lines=[],line="";for(var i=0;i<words.length;i++){var next=line?line+" "+words[i]:words[i];if(ctx.measureText(next).width>width&&line){lines.push(line);line=words[i];if(lines.length>=limit-1){var rem=[line].concat(words.slice(i+1)).join(" ");while(rem.length>2&&ctx.measureText(rem+"…").width>width)rem=rem.slice(0,-1);lines.push(rem+(rem.length<[line].concat(words.slice(i+1)).join(" ").length?"…":""));return lines;}}else line=next}if(line)lines.push(line);return lines}
function drawText(ctx,str,x,y,size,color,align,weight){ctx.font=(weight||700)+" "+size+"px system-ui,Tahoma,sans-serif";ctx.direction=align==="left"?"ltr":"rtl";ctx.textAlign=align||"right";ctx.fillStyle=color||"#fff";ctx.fillText(str,x,y)}
function cover(ctx,img,x,y,w,h){var s=Math.max(w/img.naturalWidth,h/img.naturalHeight),dw=img.naturalWidth*s,dh=img.naturalHeight*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

function sourceIdentity(name,url){
 var n=clean(name).replace(/^المصدر\s*[:：]\s*/,"").trim();
 var l=n.toLowerCase(),u=String(url||"").toLowerCase();
 if(/(?:^|\s|[–—:-])سانا(?:\s|$)|وكالة الأنباء.*السور/i.test(n)||/sana\.sy|sananews\.sy/.test(u))return {name:n,icon:"/source-logos/sana.png",key:"sana"};
 if(/الجزيرة|al[\s-]?jazeera/i.test(n)||/aljazeera\.net|aljazeera\.com/.test(u))return {name:n,icon:"/source-logos/aljazeera.png",key:"aljazeera"};
 if(/صهيب\s+اليعربي|suhaib[\s-]*al/i.test(n)||/t\.me\/(?:suhebb0|sohebb1993)/i.test(u))return {name:n,icon:"/source-logos/suhaib.png",key:"suhaib"};
 var fallback="";
 try{
  var parsed=new URL(url||""),host=parsed.hostname.toLowerCase();
  if(parsed.protocol==="https:"&&!parsed.username&&!parsed.password){
   if(host==="t.me"||host==="telegram.me"){
    var parts=parsed.pathname.split("/").filter(Boolean),handle=parts[0]==="s"?parts[1]:parts[0];
    if(/^[a-zA-Z0-9_]{5,32}$/.test(handle||""))fallback="https://t.me/i/userpic/320/"+handle+".jpg";
   }else if(host.indexOf(".")>0){
    fallback="https://www.google.com/s2/favicons?domain="+encodeURIComponent(host)+"&sz=128";
   }
  }
 }catch(e){}
 return {name:n||"غير محدد",icon:fallback,key:"other"};
}
function safeDate(raw){
 if(!raw)return "";
 var dt=new Date(raw);if(!Number.isFinite(dt.getTime()))return "";
 try{return new Intl.DateTimeFormat("ar-SY",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true}).format(dt)}
 catch(e){return dt.toISOString().slice(0,16).replace("T"," ")}
}
function rounded(g,x,y,w,h,r,fill,stroke){
 g.beginPath();g.roundRect(x,y,w,h,r);if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=3;g.stroke()}
}
function drawTelegram(g,x,y,d){
 g.fillStyle="#23a9df";g.beginPath();g.arc(x,y,d*.5,0,Math.PI*2);g.fill();
 g.fillStyle="#fff";g.beginPath();g.moveTo(x-d*.29,y-d*.035);g.lineTo(x+d*.31,y-d*.26);g.lineTo(x+d*.10,y+d*.31);g.lineTo(x-d*.025,y+d*.12);g.lineTo(x-d*.13,y+d*.20);g.lineTo(x-d*.11,y+d*.04);g.closePath();g.fill();
}
async function render(item,format){
 var dims=FORMATS[format]||FORMATS.portrait,w=dims[0],h=dims[1],land=w>h,margin=land?68:72;
 var can=document.createElement("canvas");can.width=w;can.height=h;
 var g=can.getContext("2d",{alpha:false}),bg=g.createLinearGradient(0,0,w,h);
 bg.addColorStop(0,"#03152e");bg.addColorStop(.65,"#082448");bg.addColorStop(1,"#03162e");g.fillStyle=bg;g.fillRect(0,0,w,h);
 var identity=sourceIdentity(item.source,item.sourceUrl),warning="";
 var photo=null,logo=null,brandIcon=null;
 if(item.photo)try{photo=await loadImage(item.photo)}catch(e){warning="تعذّر استخدام صورة المصدر، فأنشأنا بطاقة نصية."}
 if(identity.icon)try{logo=await loadImage(identity.icon)}catch(e){warning+=(warning?" ":"")+"تعذّر تحميل شعار المصدر؛ يظهر اسمه دون شعار."}
 try{brandIcon=await loadImage("/assets/icon-192-v2.png")}catch(e){}
 var headerHeight=land?116:140, footerHeight=land?174:245, contentEnd=h-footerHeight;
 // Editorial header: brand icon only, small original attribution badge, no repeated brand word.
 g.fillStyle="#06142b";g.fillRect(0,0,w,headerHeight);
 g.fillStyle="#f0bc55";g.fillRect(0,headerHeight-5,w,5);
 if(brandIcon){rounded(g,w-margin-107,17,100,100,17,"#0b2d58","#f0bc55");g.save();g.beginPath();g.roundRect(w-margin-103,21,92,92,13);g.clip();cover(g,brandIcon,w-margin-103,21,92,92);g.restore()}
 else {drawText(g,"م",w-margin-12,91,65,"#f0bc55","right",800)}
 rounded(g,margin,35,land?340:305,63,8,"#f0bc55");
 drawText(g,"منشور من المصدر",margin+(land?316:282),80,land?27:29,"#06142b","right",800);
 // Clean division: image never shares its space with the headline.
 var imageHeight=photo?(land?Math.round(h*.37):Math.round(h*.39)):0;
 var imageY=headerHeight;
 if(photo){cover(g,photo,0,imageY,w,imageHeight);g.fillStyle="#f0bc55";g.fillRect(0,imageY+imageHeight-3,w,5)}
 else{
  g.strokeStyle="rgba(240,188,85,.09)";g.lineWidth=2;
  for(var j=0;j<7;j++){g.beginPath();g.arc(w*.48,h*.36,(j+1)*95,0,6.283);g.stroke()}
  // no artificial image substituted for a text-only article
 }
 var title=clean(item.title).slice(0,400)||"عنوان الخبر",titleTop=photo?headerHeight+imageHeight+(land?54:76):(land?headerHeight+75:Math.round(h*.32));
 var maxBottom=contentEnd-(land?24:110);
 var titleWidth=w-2*margin,titleSize=land?47:format==="story"?69:62,arr=[];
 var wantSummary=!land&&!!clean(item.summary);
 for(;titleSize>=35;titleSize-=2){
  g.font="800 "+titleSize+"px system-ui,Tahoma,sans-serif";
  arr=wrap(g,title,titleWidth,land?3:format==="story"?7:5);
  var titleEnd=titleTop+(arr.length-1)*titleSize*1.45+titleSize*.3;
  var availableForSummary=wantSummary?115:15;
  if(titleEnd+availableForSummary<maxBottom)break;
 }
 g.font="800 "+titleSize+"px system-ui,Tahoma,sans-serif";
 arr=wrap(g,title,titleWidth,land?3:format==="story"?7:5);
 if(!photo){g.fillStyle="rgba(10,45,96,.64)";g.fillRect(margin-17,titleTop-titleSize, w-2*margin+34, arr.length*titleSize*1.5+44)}
 for(var i=0;i<arr.length;i++)drawText(g,arr[i],w-margin,titleTop+i*titleSize*1.44,titleSize,"#fff","right",800);
 var endTitle=titleTop+(arr.length-1)*titleSize*1.44+22;
 if(wantSummary){
  var sum=clean(item.summary).slice(0,360),summaryY=endTitle+67;
  if(summaryY+105<contentEnd-36){
   g.fillStyle="#f0bc55";g.fillRect(margin,summaryY-43,w-2*margin,3);
   g.font="400 31px system-ui,Tahoma,sans-serif";
   var sl=wrap(g,sum,titleWidth,format==="story"?4:3);
   sl.forEach(function(line,i){drawText(g,line,w-margin,summaryY+i*48,31,"#dce6f2","right",400)});
  }
 }
 // Footer separated from content and made highly legible on all photo backgrounds.
 var footTop=h-footerHeight;g.fillStyle="#06162d";g.fillRect(0,footTop,w,footerHeight);
 g.fillStyle="#f0bc55";g.fillRect(margin,footTop+12,w-2*margin,4);
 var sourceY=footTop+(land?61:82);var dateText=safeDate(item.date);
 var sourceName=identity.name.slice(0,46);
 var sourceIconSize=land?45:57,sourceLogoX=w-margin-sourceIconSize,logoY=sourceY-sourceIconSize+11;
 rounded(g,sourceLogoX-5,logoY-5,sourceIconSize+10,sourceIconSize+10,9,"#f4f7fc");
 if(logo) {g.save();g.beginPath();g.roundRect(sourceLogoX,logoY-1,sourceIconSize,sourceIconSize,7);g.clip();var sc=Math.min(sourceIconSize/logo.naturalWidth,sourceIconSize/logo.naturalHeight);g.drawImage(logo,sourceLogoX+(sourceIconSize-logo.naturalWidth*sc)/2,logoY-1+(sourceIconSize-logo.naturalHeight*sc)/2,logo.naturalWidth*sc,logo.naturalHeight*sc);g.restore()}
 else drawText(g,"م",w-margin-10,sourceY-4,30,"#1a3659","right",800);
 var textWidth=w-2*margin-sourceIconSize-(dateText?320:90);g.font="700 "+(land?26:30)+"px system-ui,Tahoma,sans-serif";
 var sourceCaption="المصدر: "+sourceName;
 while(sourceCaption.length>9&&g.measureText(sourceCaption).width>textWidth){sourceName=sourceName.slice(0,-1);sourceCaption="المصدر: "+sourceName+"…"}
 drawText(g,sourceCaption,w-margin-sourceIconSize-20,sourceY-2,land?26:30,"#f4f7fc","right",700);
 if(dateText)drawText(g,dateText,margin,sourceY-2,land?23:26,"#cbd5e1","left",400);
 // Clear Telegram identity, independent of original source attribution.
 var rowY=land?footTop+99:footTop+136,rowH=land?65:75;
 rounded(g,margin,rowY,w-2*margin,rowH,22,"#0c315a","#f0bc55");
 drawTelegram(g,margin+45,rowY+rowH/2,land?47:55);
 drawText(g,"تيليجرام",w-margin-21,rowY+(land?43:47),land?27:30,"#fff","right",800);
 drawText(g,HANDLE,margin+99,rowY+(land?43:47),land?27:30,"#f0bc55","left",800);
 if(!land)drawText(g,"التفاصيل والمصدر الأصلي عبر ميدان الخبر",w-margin,h-18,21,"#abbfd4","right",400);
 return {canvas:can,warning:warning,source:identity.name,sourceLogo:identity.key};
}
function article(node){var title=node.querySelector("h1,h2,h3,.news-title,.article-title,[data-title]"),img=node.querySelector("img[data-original-src],img[data-highres],img[data-fullsize],.news-media img,.article-image img,img"),sum=node.querySelector(".card-desc,.news-summary,.article-summary,.article-body,p"),src=node.querySelector(".source-name,.detail-source"),date=node.querySelector("time,[datetime]"),meta=node.querySelector(".card-meta");var linked=(typeof articles!=="undefined"&&Array.isArray(articles)&&node.dataset.article)?articles.find(function(a){return String(a.id)===String(node.dataset.article)}):null;var photo=img?(img.dataset.originalSrc||img.dataset.highres||img.dataset.fullsize||img.dataset.original||img.currentSrc||img.src):"";if(!photo&&linked)photo=linked.imageUrl||linked.image||linked.thumbnailUrl||"";return {title:clean(title?.textContent||node.dataset.title),summary:clean(sum?.textContent),source:clean(src?.textContent),sourceUrl:(linked?.url||src?.querySelector?.("a[href]")?.href||node.querySelector?.(".source-link[href]")?.href||""),date:date?.dateTime||clean(date?.textContent),category:clean(meta?.textContent).slice(0,24)||"آخر الأخبار",photo:photo}}
var modal,model,current=null,generated=null,working=false;
function open(data){current=data;if(!modal){modal=document.createElement("div");modal.className="mcs-modal";modal.hidden=true;modal.innerHTML='<div class="mcs-shade" data-mcs-close></div><section class="mcs-box" role="dialog" aria-modal="true" aria-label="إنشاء صورة الخبر"><div class="mcs-top"><strong>تصميم صورة الخبر • ميدان الخبر</strong><button class="mcs-close" type="button" data-mcs-close>×</button></div><div class="mcs-control"><label for="mcs-size">المقاس</label><select id="mcs-size"><option value="portrait">منشور عمودي 4:5</option><option value="square">مربع 1:1</option><option value="story">ستوري 9:16</option><option value="wide">أفقي 16:9</option></select></div><p class="mcs-msg" id="mcs-msg"></p><img class="mcs-preview" id="mcs-preview" alt="بطاقة الخبر المصممة"><div class="mcs-actions"><button id="mcs-save" type="button">تحميل الصورة</button><button id="mcs-share" type="button">مشاركة الصورة</button></div><p class="mcs-note">تظهر جهة المصدر عند توفرها؛ البطاقة ليست تحققًا مستقلًا من صحة الخبر.</p></section>';document.body.append(modal);
modal.querySelectorAll("[data-mcs-close]").forEach(function(n){n.addEventListener("click",function(){modal.hidden=true})});
modal.querySelector("#mcs-size").onchange=refresh;modal.querySelector("#mcs-save").onclick=function(){act("save")};modal.querySelector("#mcs-share").onclick=function(){act("share")}}
modal.hidden=false;refresh()}
async function refresh(){if(working||!current)return;working=true;var msg=modal.querySelector("#mcs-msg");msg.textContent="جارٍ إنشاء صورة الخبر…";try{generated=await render(current,modal.querySelector("#mcs-size").value);modal.querySelector("#mcs-preview").src=toData(generated.canvas);msg.textContent=generated.warning||""}catch(e){generated=null;msg.textContent="تعذر إنشاء الصورة، حاول مرة أخرى."}finally{working=false}}
function toData(c){var data=c.toDataURL("image/png");for(var i=0;i<5&&data.length>7200000;i++){var d=document.createElement("canvas");d.width=Math.max(600,Math.round(c.width*.85));d.height=Math.max(600,Math.round(c.height*.85));d.getContext("2d").drawImage(c,0,0,d.width,d.height);c=d;data=c.toDataURL("image/png")}return data}
function download(data){var a=document.createElement("a");a.href=data;a.download="midan-al-khabar-"+Date.now()+".png";document.body.append(a);a.click();a.remove()}
async function act(kind){if(!generated||working)return;var btn=modal.querySelector(kind==="share"?"#mcs-share":"#mcs-save");btn.disabled=true;try{var data=toData(generated.canvas),b=window.AndroidBridge,fn=kind==="share"?"shareImagePng":"saveImagePng";if(b&&typeof b[fn]==="function"&&data.length<7400000){b[fn](data);return}if(kind==="share"&&navigator.share&&navigator.canShare){var blob=await(await fetch(data)).blob(),file=new File([blob],"midan-al-khabar.png",{type:"image/png"});if(navigator.canShare({files:[file]})){await navigator.share({title:BRAND,files:[file]});return}}download(data)}catch(e){if(e?.name!=="AbortError"){modal.querySelector("#mcs-msg").textContent="لم تعمل المشاركة المباشرة. استخدم زر تحميل الصورة."}}finally{btn.disabled=false}}
function install(){var list=document.querySelector("#newsList"),detail=document.querySelector("#modalContent");if(!list||!detail)return;var lastId=null;
document.addEventListener("click",function(e){var el=e.target.closest?.("[data-open]");if(el)lastId=el.getAttribute("data-open")},true);
function attach(node){if(!node||node.querySelector(".mcs-create")||!node.querySelector("h2,h3"))return;var b=document.createElement("button");b.className="mcs-create";b.type="button";b.textContent="▣ إنشاء صورة الخبر";b.setAttribute("aria-label","إنشاء صورة الخبر");b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();var data=article(node);if(node===detail&&lastId){var alt=list.querySelector('[data-article="'+CSS.escape(lastId)+'"]');if(alt){var more=article(alt);if(!data.photo)data.photo=more.photo;if(!data.source)data.source=more.source;if(!data.date)data.date=more.date;if(!data.sourceUrl)data.sourceUrl=more.sourceUrl}}open(data)});node.appendChild(b)}
function scan(){list.querySelectorAll("article.news-card").forEach(attach);if(detail.querySelector("h2"))attach(detail)}
var timer;new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(scan,80)}).observe(list,{childList:true,subtree:true});new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(scan,80)}).observe(detail,{childList:true,subtree:true});scan()}
window.MidanNewsCardStudio={open:open,render:render,clean:clean,formats:FORMATS};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();