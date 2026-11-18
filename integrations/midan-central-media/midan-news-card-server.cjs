'use strict';
// Pure server renderer, extracted from the production news-card-studio.js.
// No network requests, filesystem reads or Telegram sends; pass verified image bytes.
// Preserve website template geometry, source attribution and original photo.
const {createCanvas,loadImage:decode,GlobalFonts}=require('@napi-rs/canvas');
const sharp=require('sharp');
const FORMATS={portrait:[1080,1350],square:[1080,1080],story:[1080,1920],wide:[1600,900]},HANDLE='@maydan_alkhabar';
let fontReady=false;
function registerArabicFont(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1024||bytes.length>5000000)throw Error('FONT_INVALID');
 if(!fontReady){if(!GlobalFonts.register(bytes,'Midan Arabic'))throw Error('FONT_REGISTRATION_FAILED');fontReady=true;}
}
async function verifiedImage(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>12000000)throw Error('IMAGE_BYTES_INVALID');
 const normalized=await sharp(bytes,{limitInputPixels:24000000,failOn:'error'}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 return decode(normalized);
}
async function createNewsCard(item,{photoBytes,brandBytes,sourceLogoBytes,format='portrait'}={}){
 if(!fontReady)throw Error('ARABIC_FONT_REQUIRED');
 if(!item?.id||!String(item.title||'').trim()||!['text','photo'].includes(item.kind))throw Error('NEWS_CARD_INPUT_INVALID');
 if(!Object.hasOwn(FORMATS,format))throw Error('NEWS_CARD_FORMAT');
 if(item.kind==='photo'&&!photoBytes)throw Error('ORIGINAL_PHOTO_REQUIRED');
 if(item.kind==='text'&&photoBytes)throw Error('UNEXPECTED_PHOTO');
 const privateNews=item.sourceId==='private-source99';
 const safeItem={...item,title:String(item.title).slice(0,1500),summary:String(item.summary||'').slice(0,2500),source:privateNews?'خاص بميدان الخبر':String(item.source||'').slice(0,300),sourceUrl:privateNews?'':String(item.sourceUrl||''),photo:item.kind==='photo'?'__ORIGINAL_PHOTO__':null};
 const identity=sourceIdentity(safeItem.source,safeItem.sourceUrl);
 // Assets are explicit trusted buffers. No arbitrary URLs are followed.
 async function loadImage(key){
  if(key==='__ORIGINAL_PHOTO__')return verifiedImage(photoBytes);
  if(key==='/assets/icon-192-v2.png')return verifiedImage(brandBytes);
  if(!privateNews&&key===identity.icon&&sourceLogoBytes)return verifiedImage(sourceLogoBytes);
  return null;
 }
 async function render(item,format){
 var dims=FORMATS[format]||FORMATS.portrait,w=dims[0],h=dims[1],land=format==="wide",margin=land?46:60;
 var c=createCanvas(w,h);var g=c.getContext("2d",{alpha:false});
 var gradient=g.createLinearGradient(0,0,w,h);gradient.addColorStop(0,"#06142b");gradient.addColorStop(.55,"#092c55");gradient.addColorStop(1,"#04152d");g.fillStyle=gradient;g.fillRect(0,0,w,h);
 var identity=sourceIdentity(item.source,item.sourceUrl),img=null,logo=null,brand=null,warning="";
 if(item.photo){img=await loadImage(item.photo);if(!img)throw Error("ORIGINAL_PHOTO_REQUIRED");}
 if(identity.icon)try{logo=await loadImage(identity.icon)}catch(e){warning+=(warning?" ":"")+"الشعار غير متاح، يظهر اسم المصدر فقط."}
 brand=await loadImage("/assets/icon-192-v2.png");if(!brand)throw Error("BRAND_REQUIRED");
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

 const result=await render(safeItem,format);
 const png=result.canvas.toBuffer('image/png');
 const meta=await sharp(png).metadata();
 if(meta.width!==FORMATS[format][0]||meta.height!==FORMATS[format][1]||png.length>9500000)throw Error('NEWS_CARD_OUTPUT_INVALID');
 return {png,layout:result.layout,source:result.source,sourceLogo:result.sourceLogo,warning:result.warning};
}
function clean(s){var t=String(s||"");for(var i=0;i<4;i++){var n=t.replace(/&amp;/gi,"&").replace(/&(?:rlm|lrm|zwnj|zwj);|&#(?:x(?:200e|200f|202a|202b|202c|202d|202e|2066|2067|2068|2069)|8206|8207);/gi,"");if(n===t)break;t=n;}return t.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function wrap(ctx,str,width,limit){var words=str.split(/\s+/).filter(Boolean),lines=[],line="";for(var i=0;i<words.length;i++){var next=line?line+" "+words[i]:words[i];if(ctx.measureText(next).width>width&&line){lines.push(line);line=words[i];if(lines.length>=limit-1){var rem=[line].concat(words.slice(i+1)).join(" ");while(rem.length>2&&ctx.measureText(rem+"…").width>width)rem=rem.slice(0,-1);lines.push(rem+(rem.length<[line].concat(words.slice(i+1)).join(" ").length?"…":""));return lines;}}else line=next}if(line)lines.push(line);return lines}
function drawText(ctx,str,x,y,size,color,align,weight){ctx.font=(weight||700)+" "+size+"px Midan Arabic, sans-serif";ctx.direction=align==="left"?"ltr":"rtl";ctx.textAlign=align||"right";ctx.fillStyle=color||"#fff";ctx.fillText(str,x,y)}
function cover(ctx,img,x,y,w,h){var s=Math.max(w/(img.naturalWidth||img.width),h/(img.naturalHeight||img.height)),dw=(img.naturalWidth||img.width)*s,dh=(img.naturalHeight||img.height)*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}

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
  g.font=(style.weight||800)+" "+size+"px Midan Arabic, sans-serif";
  var allowed=Math.max(1,Math.min(max,Math.floor(height/(size*lh))));
  lines=mcsLines(g,txt,box.w,allowed);
  var ratio=lines.length*size*lh;
  if(ratio<=height-3&&(!txt||!lines.length||lines[lines.length-1].indexOf("…")<0))break;
 }
 size=Math.max(size,minFont);
 g.font=(style.weight||800)+" "+size+"px Midan Arabic, sans-serif";
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
 var ratio=Math.min(rect.w/(img.naturalWidth||img.width),rect.h/(img.naturalHeight||img.height));
 var dw=(img.naturalWidth||img.width)*ratio,dh=(img.naturalHeight||img.height)*ratio;
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
 g.font="700 "+labelSize+"px Midan Arabic, sans-serif";
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

module.exports={createNewsCard,registerArabicFont};
