'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),{execFileSync}=require('node:child_process');
const parts=Array.from({length:6},(_,i)=>fs.readFileSync(path.join(__dirname,'encrypted','part-'+String(i).padStart(2,'0')+'.b64'),'ascii'));
if(parts.slice(0,5).some(v=>v.length!==409600)||parts[5].length!==74512)throw Error('PART_SIZE');
const archive=Buffer.from(parts.join(''),'base64');
if(archive.length!==1591883||crypto.createHash('sha256').update(archive).digest('hex')!=='5602868b67b16ba4a92497d09e2b3cf5be261a78813b2ec176fda4df6d2040d0')throw Error('CIPHER_INTEGRITY');
execFileSync('python',['-c','import numpy,scipy,webrtcvad'],{stdio:'ignore',timeout:10000});
execFileSync('ffmpeg',['-version'],{stdio:'ignore',timeout:5000});
execFileSync('ffprobe',['-version'],{stdio:'ignore',timeout:5000});
archive.fill(0);
if(process.argv.includes('--check-only')){console.log('ciphertext and dependencies verified');process.exit(0)}
http.createServer((req,res)=>{
 const health=req.method==='GET'&&req.url==='/health';
 res.writeHead(health?200:503,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({ok:false,ready:false,mode:'build-verification-only',archiveVerified:true,dependenciesVerified:true,processingEnabled:false}));
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
