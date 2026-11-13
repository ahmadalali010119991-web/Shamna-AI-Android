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
 if(/بي\s*بي\s*سي|bbc(?:\s*news)?/i.test(n)||/bbc\.(?:com|co\.uk)/i.test(u))return {name:n,icon:"/source-logos/bbc.png",key:"bbc"};
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

/* Version 3: strict non-overlapping editorial zones, one geometry per format.
   All text baselines are measured and clipped to dedicated rectangles. */
function mcsLines(ctx,raw,width,maxLines){
 var words=clean(raw).split(/\s+/).filter(Boolean),result=[],line="",truncated=false;
 function fitOne(word){if(ctx.measureText(word).width<=width)return word;
  var kept="";for(var ch of word){if(ctx.measureText(kept+ch+"…").width>width)break;kept+=ch}return kept+"…"}
 for(var i=0;i<words.length;i++){
  var word=fitOne(words[i]),next=line?line+" "+word:word;
  if(ctx.measureText(next).width<=width){line=next;continue}
  if(line){result.push(line);line=word}else {result.push(word);line=""}
  if(result.length>=maxLines){truncated=i<words.length-1||!!line;break}
 }
 if(line&&result.length<maxLines)result.push(line);
 if(truncated&&result.length){var last=result[result.length-1];while(last.length>1&&ctx.measureText(last+"…").width>width)last=last.slice(0,-1);result[result.length-1]=last.replace(/…$/,"")+"…"}
 return result.slice(0,maxLines);
}
function mcsTextBox(g,raw,box,style){
 var txt=clean(raw),height=box.h,lh=style.lh||1.3,max=style.max||5,maxFont=style.font||50,minFont=style.min||24,lines=[],size=maxFont;
 for(;size>=minFont;size-=2){
  g.font=(style.weight||800)+" "+size+"px system-ui,Tahoma,sans-serif";
  var allowed=Math.max(1,Math.min(max,Math.floor(height/(size*lh))));
  lines=mcsLines(g,txt,box.w,allowed);
  var ratio=lines.length*size*lh;
  if(ratio<=height-3&&(!txt||!lines.length||lines[lines.length-1].indexOf("…")<0))break;
 }
 size=Math.max(size,minFont);
 g.font=(style.weight||800)+" "+size+"px system-ui,Tahoma,sans-serif";
 var allowed2=Math.max(1,Math.min(max,Math.floor(height/(size*lh))));
 lines=mcsLines(g,txt,box.w,allowed2);
 g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();
 var lineH=size*lh,first=box.y+Math.max(size*.96,(height-lines.length*lineH)*.5+size*.97);
 for(var i=0;i<lines.length;i++){if(first+i*lineH>box.y+box.h-3)break;drawText(g,lines[i],box.x+box.w,first+i*lineH,size,style.color||"#fff","right",style.weight||800)}
 g.restore();return {font:size,lines:lines,box:box};
}
function mcsRule(g,x,y,w){g.fillStyle="#f0bc55";g.fillRect(x,y,w,3)}
function mcsPhoto(g,img,rect){
 if(!img)return;
 // contain: preserve publisher's embedded logo, captions, faces and copyright.
 g.save();g.beginPath();g.rect(rect.x,rect.y,rect.w,rect.h);g.clip();
 g.fillStyle="#0b2344";g.fillRect(rect.x,rect.y,rect.w,rect.h);
 var ratio=Math.min(rect.w/img.naturalWidth,rect.h/img.naturalHeight);
 var dw=img.naturalWidth*ratio,dh=img.naturalHeight*ratio;
 g.drawImage(img,rect.x+(rect.w-dw)/2,rect.y+(rect.h-dh)/2,dw,dh);
 g.restore();
}
function mcsImageHeader(g,w,margin,icon,y,scale){
 var box=scale||88;
 if(icon){rounded(g,w-margin-box,y,box,box,14,"#0b2d58","#f0bc55");
  g.save();g.beginPath();g.roundRect(w-margin-box+4,y+4,box-8,box-8,11);g.clip();mcsPhoto(g,icon,{x:w-margin-box+4,y:y+4,w:box-8,h:box-8});g.restore()}
 rounded(g,margin,y+12,Math.min(290,w*.35),54,9,"#f0bc55");
 drawText(g,"منشور من المصدر",margin+Math.min(268,w*.35-20),y+49,Math.min(27,w*.021+9),"#06142b","right",800);
}
function mcsSourceFooter(g,item,identity,logo,zone,portrait){
 var {x,y,w,h}=zone,small=h<200;
 g.fillStyle="#06162d";g.fillRect(x,y,w,h);
 mcsRule(g,x+24,y+7,w-48);
 var labelSize=small?24:29,iconSize=small?42:53;
 var mainY=y+(small?56:77),right=x+w-34;
 var sourceName=clean(identity.name||item.source||"المصدر غير محدد");
 var date=safeDate(item.date),dateWidth=small?220:245;
 var labelX=right-(logo?iconSize+14:0);
 var textMax=Math.max(135,w-(right-labelX)-dateWidth-125);
 g.font="700 "+labelSize+"px system-ui,Tahoma,sans-serif";
 var label="المصدر: "+sourceName;
 while(label.length>11&&g.measureText(label).width>textMax)label=label.slice(0,-2)+"…";
 if(logo){rounded(g,right-iconSize,mainY-iconSize+10,iconSize,iconSize,9,"#12385b","#375676");
  g.save();g.beginPath();g.roundRect(right-iconSize+2,mainY-iconSize+12,iconSize-4,iconSize-4,7);g.clip();mcsPhoto(g,logo,{x:right-iconSize+2,y:mainY-iconSize+12,w:iconSize-4,h:iconSize-4});g.restore()}
 drawText(g,label,labelX,mainY,labelSize,"#f4f7fc","right",700);
 if(date)drawText(g,date,x+35,mainY,small?20:23,"#cbd5e1","left",400);
 var tgY=y+(small?75:112),tgH=small?60:72;
 rounded(g,x+29,tgY,w-58,tgH,17,"#103761","#f0bc55");
 drawTelegram(g,x+72,tgY+tgH/2,small?43:50);
 drawText(g,"تيليجرام",x+w-50,tgY+tgH*.64,small?24:28,"#fff","right",800);
 drawText(g,HANDLE,x+124,tgY+tgH*.64,small?23:27,"#f0bc55","left",800);
 if(!small)drawText(g,"التفاصيل والمصدر الأصلي عبر ميدان الخبر",x+w-32,y+h-19,19,"#a9bfd5","right",400);
}
async function render(item,format){
 var dims=FORMATS[format]||FORMATS.portrait,w=dims[0],h=dims[1],land=format==="wide",margin=land?46:60;
 var c=document.createElement("canvas");c.width=w;c.height=h;var g=c.getContext("2d",{alpha:false});
 var gradient=g.createLinearGradient(0,0,w,h);gradient.addColorStop(0,"#06142b");gradient.addColorStop(.55,"#092c55");gradient.addColorStop(1,"#04152d");g.fillStyle=gradient;g.fillRect(0,0,w,h);
 var identity=sourceIdentity(item.source,item.sourceUrl),img=null,logo=null,brand=null,warning="";
 if(item.photo)try{img=await loadImage(item.photo)}catch(e){warning="تعذر استخدام صورة المصدر؛ استخدمنا قالبًا نصيًا."}
 if(identity.icon)try{logo=await loadImage(identity.icon)}catch(e){warning+=(warning?" ":"")+"الشعار غير متاح، يظهر اسم المصدر فقط."}
 try{brand=await loadImage("/assets/icon-192-v2.png")}catch(e){}
 // Completely independent geometry for horizontal cards.
 var header=land?100:format==="story"?140:125,footer=land?170:format==="story"?245:format==="square"?210:230;
 g.fillStyle="#06142b";g.fillRect(0,0,w,header);mcsRule(g,0,header-4,w);
 mcsImageHeader(g,w,margin,brand,land?6:12,land?77:88);
 var bodyBottom=h-footer,bodyHeight=bodyBottom-header;
 if(land){
  // Photo left / editorial text right. No title may ever cross into photo.
  var photoW=Math.round(w*.49),textX=photoW+24,textW=w-textX-margin;
  if(img){mcsPhoto(g,img,{x:0,y:header,w:photoW,h:bodyHeight});g.fillStyle="#f0bc55";g.fillRect(photoW-4,header,4,bodyHeight)}
  else {photoW=0;textX=margin;textW=w-2*margin}
  var tY=header+25,titleH=Math.round(bodyHeight*.62),summaryY=tY+titleH+10;
  mcsTextBox(g,item.title,{x:textX,y:tY,w:textW,h:titleH},{font:img?50:57,min:30,max:5,lh:1.30});
  mcsRule(g,textX,summaryY-4,textW);
  mcsTextBox(g,item.summary||"",{x:textX,y:summaryY+6,w:textW,h:Math.max(35,bodyBottom-summaryY-20)},{font:25,min:17,max:3,lh:1.35,weight:400,color:"#dbe6f2"});
 }else{
  // Photo is completely above both text rectangles; fixed max bounds per format.
  var photoH=img?Math.round(bodyHeight*(format==="story"?.49:format==="square"?.52:.49)):0;
  if(img){mcsPhoto(g,img,{x:0,y:header,w:w,h:photoH});mcsRule(g,0,header+photoH-4,w)}
  var textY=img?header+photoH+14:header+Math.round(bodyHeight*.13);
  var remain=bodyBottom-textY-24;
  var titleH=Math.round(remain*(img?.58:.59));
  var summaryY=textY+titleH+13,summaryH=Math.max(25,bodyBottom-summaryY-18);
  mcsTextBox(g,item.title,{x:margin,y:textY,w:w-2*margin,h:titleH},{font:format==="story"?72:format==="square"?53:65,min:31,max:format==="story"?7:5,lh:1.31});
  mcsRule(g,margin,summaryY-7,w-2*margin);
  mcsTextBox(g,item.summary||"",{x:margin+4,y:summaryY+7,w:w-2*margin-8,h:Math.max(20,summaryH-8)},{font:format==="story"?34:format==="square"?26:31,min:18,max:format==="story"?5:4,lh:1.34,weight:400,color:"#dce6f2"});
 }
 mcsSourceFooter(g,item,identity,logo,{x:0,y:h-footer,w:w,h:footer},!land);
 return {canvas:c,warning:warning,sourceLogo:identity.key,source:identity.name,layout:{header:header,footer:footer,width:w,height:h,photo:!!img}};
}
function article(node){
 var sports=node.matches(".m-sports-card"),voice=node.matches(".voice-post");
 var title=node.querySelector("h1,h2,h3,.news-title,.article-title,[data-title]");
 var img=node.querySelector("img[data-original-src],img[data-highres],img[data-fullsize],.article-source-media img,.news-media img,.article-image img,img");
 var sum=node.querySelector(".card-desc,.news-summary,.article-summary,.article-body,p");
 var src=node.querySelector(".source-name,.detail-source"),date=node.querySelector("time,[datetime]"),meta=node.querySelector(".card-meta");
 var linked=(typeof articles!=="undefined"&&Array.isArray(articles)&&node.dataset.article)?articles.find(function(a){return String(a.id)===String(node.dataset.article)}):null;
 var photo=img?(img.dataset.originalSrc||img.dataset.highres||img.dataset.fullsize||img.dataset.original||img.currentSrc||img.src):"";
 if(!photo&&linked)photo=linked.imageUrl||linked.image||linked.thumbnailUrl||"";
 var source=clean(src?.textContent),sourceUrl=linked?.url||src?.querySelector?.("a[href]")?.href||node.querySelector?.(".source-link[href],.m-sports-source[href],.card-foot a[href]")?.href||"";
 var dateValue=date?.dateTime||clean(date?.textContent);
 if(sports){
  var sportsMeta=clean(node.querySelector(".m-sports-meta")?.textContent);
  source=clean(sportsMeta.split(/\s+•\s+/)[0])||source||"مصدر الخبر الرياضي";
  var sportsDate=sportsMeta.split(/\s+•\s+/).slice(1).join(" • ");
  if(!dateValue&&sportsDate)dateValue=sportsDate;
 }
 if(voice){
  var author=clean(node.querySelector(".voice-byline")?.textContent).replace(/^✍️\s*/,"");
  if(author&&(!source||/^(?:مصدر خاص|مصدر غير محدد|منشور من المصدر)$/i.test(source)))source=author;
 }
 var category=sports?"الرياضة":voice?"الميدان السوري":clean(meta?.textContent).slice(0,24)||"آخر الأخبار";
 return {title:clean(title?.textContent||node.dataset.title),summary:clean(sum?.textContent),source:source,date:dateValue,sourceUrl:sourceUrl,category:category,photo:photo};
}
var modal,model,current=null,generated=null,working=false;
function open(data){current=data;if(!modal){modal=document.createElement("div");modal.className="mcs-modal";modal.hidden=true;modal.innerHTML='<div class="mcs-shade" data-mcs-close></div><section class="mcs-box" role="dialog" aria-modal="true" aria-label="إنشاء صورة الخبر"><div class="mcs-top"><strong>تصميم صورة الخبر • ميدان الخبر</strong><button class="mcs-close" type="button" data-mcs-close>×</button></div><div class="mcs-control"><label for="mcs-size">المقاس</label><select id="mcs-size"><option value="portrait">منشور عمودي 4:5</option><option value="square">مربع 1:1</option><option value="story">ستوري 9:16</option><option value="wide">أفقي 16:9</option></select></div><p class="mcs-msg" id="mcs-msg"></p><img class="mcs-preview" id="mcs-preview" alt="بطاقة الخبر المصممة"><div class="mcs-actions"><button id="mcs-save" type="button">تحميل الصورة</button><button id="mcs-share" type="button">مشاركة الصورة</button></div><p class="mcs-note">تظهر جهة المصدر عند توفرها؛ البطاقة ليست تحققًا مستقلًا من صحة الخبر.</p></section>';document.body.append(modal);
modal.querySelectorAll("[data-mcs-close]").forEach(function(n){n.addEventListener("click",function(){modal.hidden=true})});
modal.querySelector("#mcs-size").onchange=refresh;modal.querySelector("#mcs-save").onclick=function(){act("save")};modal.querySelector("#mcs-share").onclick=function(){act("share")}}
modal.hidden=false;refresh()}
async function refresh(){if(working||!current)return;working=true;var msg=modal.querySelector("#mcs-msg");msg.textContent="جارٍ إنشاء صورة الخبر…";try{generated=await render(current,modal.querySelector("#mcs-size").value);modal.querySelector("#mcs-preview").src=toData(generated.canvas);msg.textContent=generated.warning||""}catch(e){generated=null;msg.textContent="تعذر إنشاء الصورة، حاول مرة أخرى."}finally{working=false}}
function toData(c){var data=c.toDataURL("image/png");for(var i=0;i<5&&data.length>7200000;i++){var d=document.createElement("canvas");d.width=Math.max(600,Math.round(c.width*.85));d.height=Math.max(600,Math.round(c.height*.85));d.getContext("2d").drawImage(c,0,0,d.width,d.height);c=d;data=c.toDataURL("image/png")}return data}
function download(data){var a=document.createElement("a");a.href=data;a.download="midan-al-khabar-"+Date.now()+".png";document.body.append(a);a.click();a.remove()}
async function act(kind){if(!generated||working)return;var btn=modal.querySelector(kind==="share"?"#mcs-share":"#mcs-save");btn.disabled=true;try{var data=toData(generated.canvas),b=window.AndroidBridge,fn=kind==="share"?"shareImagePng":"saveImagePng";if(b&&typeof b[fn]==="function"&&data.length<7400000){b[fn](data);return}if(kind==="share"&&navigator.share&&navigator.canShare){var blob=await(await fetch(data)).blob(),file=new File([blob],"midan-al-khabar.png",{type:"image/png"});if(navigator.canShare({files:[file]})){await navigator.share({title:BRAND,files:[file]});return}}download(data)}catch(e){if(e?.name!=="AbortError"){modal.querySelector("#mcs-msg").textContent="لم تعمل المشاركة المباشرة. استخدم زر تحميل الصورة."}}finally{btn.disabled=false}}
function install(){
 var list=document.querySelector("#newsList"),detail=document.querySelector("#modalContent");
 if(!list||!detail)return;
 var lastId=null,root=document.body;
 document.addEventListener("click",function(e){var el=e.target.closest?.("[data-open]");if(el)lastId=el.getAttribute("data-open")},true);
 function attach(node){
  if(!node||node.querySelector(":scope > .mcs-create")||!node.querySelector("h2,h3"))return;
  var b=document.createElement("button");b.className="mcs-create";b.type="button";b.textContent="▣ إنشاء صورة الخبر";
  b.setAttribute("aria-label","إنشاء صورة الخبر");
  b.addEventListener("click",function(e){
   e.preventDefault();e.stopPropagation();
   var data=article(node);
   if(node===detail&&lastId){
    var alt=list.querySelector('[data-article="'+CSS.escape(lastId)+'"]');
    if(alt){var more=article(alt);if(!data.photo)data.photo=more.photo;if(!data.source)data.source=more.source;if(!data.date)data.date=more.date;if(!data.sourceUrl)data.sourceUrl=more.sourceUrl}
   }
   open(data);
  });
  var actions=node.querySelector(":scope > .card-foot .card-actions");
  if(actions)actions.appendChild(b);else node.appendChild(b);
 }
 function scan(){
  document.querySelectorAll("#newsList article.news-card, #voicesPanel article.voice-post, #sportsView article.m-sports-card").forEach(attach);
  if(detail.querySelector("h2"))attach(detail);
 }
 var timer=0;
 new MutationObserver(function(mutations){
  if(!mutations.some(function(m){return m.addedNodes.length||m.removedNodes.length}))return;
  clearTimeout(timer);timer=setTimeout(scan,65);
 }).observe(root,{childList:true,subtree:true});
 scan();
}
window.MidanNewsCardStudio={open:open,render:render,clean:clean,formats:FORMATS};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();