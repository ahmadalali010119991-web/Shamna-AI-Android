'use strict';
/** News-photo quality controls. No image resizing, transcoding or disk persistence. */
const DOCUMENT_MAX=46*1024*1024, PHOTO_MAX=9*1024*1024;
function telegramPost(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||!['t.me','telegram.me'].includes(u.hostname))return null;
  const p=u.pathname.split('/').filter(Boolean);if(p[0]==='s')p.shift();
  if(p.length!==2||!/^[a-zA-Z0-9_]{5,32}$/.test(p[0])||!/^[1-9][0-9]{0,12}$/.test(p[1]))return null;
  const id=Number(p[1]);if(!Number.isSafeInteger(id))return null;
  return {channel:p[0],id};
 }catch{return null}
}
function isolatedTelegramHtml(html,post){
 const marker='data-post="'+post.channel+'/'+post.id+'"';
 const i=String(html).indexOf(marker);
 if(i<0)return null;
 const next=String(html).indexOf('data-post="',i+marker.length);
 return String(html).slice(i,next>i?next:i+100000);
}
function dimensions(buf){
 if(!Buffer.isBuffer(buf)||buf.length<32)return null;
 if(buf.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){
  const w=buf.readUInt32BE(16),h=buf.readUInt32BE(20);
  return w&&h?{width:w,height:h}:null;
 }
 if(buf[0]!==0xff||buf[1]!==0xd8)return null;
 for(let p=2;p+9<buf.length;){
  if(buf[p]!==0xff){p++;continue}
  let tag=buf[p+1];while(tag===0xff){p++;tag=buf[p+1]}
  if(tag===0xd9||tag===0xda)break;
  if(tag===0x01||(tag>=0xd0&&tag<=0xd7)){p+=2;continue}
  if(p+4>buf.length)break;
  const len=buf.readUInt16BE(p+2);
  if(len<2||p+2+len>buf.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(tag)){
   if(len<7)break;
   const height=buf.readUInt16BE(p+5),width=buf.readUInt16BE(p+7);
   return width&&height?{width,height}:null;
  }
  p+=2+len;
 }
 return null;
}
function admissible(img){
 if(!img?.buffer||img.buffer.length<4000||img.buffer.length>DOCUMENT_MAX)return null;
 const d=dimensions(img.buffer);
 if(!d||d.width>20000||d.height>20000||d.width<80||d.height<80)return null;
 const area=d.width*d.height;
 if(area>250_000_000||Math.max(d.width/d.height,d.height/d.width)>25)return null;
 return {...img,...d,pixels:area};
}
function choose(images){
 const valid=images.map(admissible).filter(Boolean);
 valid.sort((a,b)=>(b.pixels-a.pixels)||(b.buffer.length-a.buffer.length));
 return valid[0]||null;
}
function mode(selected){
 if(!selected)return null;
 // Telegram converts sendPhoto to its own compressed renditions.
 // A document preserves original bytes, with a document thumbnail in the chat.
 if(selected.buffer.length>PHOTO_MAX||
   selected.pixels>=2_000_000||selected.width>=1800||selected.height>=1800||
   selected.buffer.length>=2_000_000)return 'document';
 return 'photo';
}
module.exports={telegramPost,isolatedTelegramHtml,dimensions,admissible,choose,mode,PHOTO_MAX,DOCUMENT_MAX};
