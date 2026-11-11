'use strict';
/** Reads 53 verified owner-provided awareness posters inside 5 Vercel ZIP packs. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const manifest=require('./midan-awareness-manifest.json');
const PACKS=[
 fs.readFileSync(__dirname+'/awareness-pack-01.zip'),
 fs.readFileSync(__dirname+'/awareness-pack-02.zip'),
 fs.readFileSync(__dirname+'/awareness-pack-03.zip'),
 fs.readFileSync(__dirname+'/awareness-pack-04.zip'),
 fs.readFileSync(__dirname+'/awareness-pack-05.zip')
];
function validate(){
 if(manifest.length!==53||new Set(manifest.map(x=>x.id)).size!==53||
  manifest.some((x,i)=>x.id!==i+1||x.file!=='Midan_AlKhabar_Message_'+String(i+1).padStart(2,'0')+'.jpg'||
   !/^[a-f0-9]{64}$/.test(x.sha256)||x.caption.length>1024))throw Error('Awareness manifest invalid');
}
validate();
function image(index){
 if(!Number.isInteger(index)||index<0||index>=53)throw Error('Poster index out of range');
 const item=manifest[index];
 const data=PACKS[Math.floor(index/11)];
 if(!data)throw Error('Poster image pack is missing');
 let offset=0;
 while(offset+30<=data.length && data.readUInt32LE(offset)===0x04034b50){
  const flags=data.readUInt16LE(offset+6),method=data.readUInt16LE(offset+8);
  const len=data.readUInt32LE(offset+18),nameLen=data.readUInt16LE(offset+26),
    extLen=data.readUInt16LE(offset+28),namePos=offset+30,contentPos=namePos+nameLen+extLen;
  if(flags||method||contentPos+len>data.length)throw Error('Poster ZIP record invalid');
  const name=data.toString('utf8',namePos,namePos+nameLen);
  if(name===item.file){
   const bytes=data.subarray(contentPos,contentPos+len);
   if(bytes.length!==item.bytes||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff||
     crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Poster corrupted: '+item.file);
   return bytes;
  }
  offset=contentPos+len;
 }
 throw Error('Poster unavailable: '+item.file);
}
function inspect(){
 const bytes=manifest.map((_,index)=>image(index).length);
 return {ok:true,posters:bytes.length,minBytes:Math.min(...bytes),maxBytes:Math.max(...bytes),
   packSizes:PACKS.map(b=>b.length)};
}
module.exports={manifest,image,inspect};
