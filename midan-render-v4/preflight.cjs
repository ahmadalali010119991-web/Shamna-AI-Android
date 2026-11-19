'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),{execFileSync}=require('node:child_process');
const parts=Array.from({length:6},(_,i)=>fs.readFileSync(path.join(__dirname,'encrypted','part-'+String(i).padStart(2,'0')+'.b64'),'ascii'));
if(parts.slice(0,5).some(v=>v.length!==409600)||parts[5].length!==74512)throw Error('PART_SIZE');
const archive=Buffer.from(parts.join(''),'base64');
if(archive.length!==1591883||crypto.createHash('sha256').update(archive).digest('hex')!=='a9f5899263d726833e0fe1cc36c195187e537f92a13129d5e1ef9785aa17ada9')throw Error('CIPHER_INTEGRITY');
execFileSync('python',['-c','import numpy,scipy,webrtcvad'],{stdio:'ignore',timeout:10000});
execFileSync('ffmpeg',['-version'],{stdio:'ignore',timeout:5000});
execFileSync('ffprobe',['-version'],{stdio:'ignore',timeout:5000});
archive.fill(0);
if(process.argv.includes('--check-only')){console.log('ciphertext and dependencies verified');process.exit(0)}
// Keep the build-only test unchanged; enable the authenticated worker only with an explicit runtime flag.
if(process.env.MIDAN_WORKER_ENABLED==='1'){
 require('./bootstrap.cjs');
 return;
}
const os=require('node:os');
function syntheticTest(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'midan-preflight-'));
 const out=path.join(dir,'synthetic.mp4');
 const started=Date.now();
 try{
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=25:duration=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=3','-filter_complex','[0:v]drawbox=x=12:y=12:w=64:h=32:color=blue@0.8:t=fill[v];[2:a]volume=0.08[bed];[1:a][bed]amix=inputs=2:duration=first:normalize=0[a]','-map','[v]','-map','[a]','-c:v','libx264','-threads','1','-preset','veryfast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-t','3',out],{stdio:'ignore',timeout:25000});
  const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{timeout:5000,maxBuffer:200000}).toString());
  const v=meta.streams.find(x=>x.codec_type==='video'),a=meta.streams.find(x=>x.codec_type==='audio');
  if(v?.codec_name!=='h264'||v.width!==640||v.height!==360||a?.codec_name!=='aac'||Math.abs(Number(meta.format?.duration)-3)>0.15||fs.statSync(out).size<1000)throw Error('SYNTHETIC_OUTPUT_INVALID');
  execFileSync('ffmpeg',['-v','error','-nostdin','-i',out,'-f','null','-'],{stdio:'ignore',timeout:10000});
  const result={passed:true,codec:v.codec_name,audioCodec:a.codec_name,width:v.width,height:v.height,seconds:Number(meta.format.duration),bytes:fs.statSync(out).size,elapsedMs:Date.now()-started,syntheticOnly:true};
  console.info(JSON.stringify({event:'midan-synthetic-transcode',...result}));
  return result;
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
const synthetic=syntheticTest();
http.createServer((req,res)=>{
 const health=req.method==='GET'&&req.url==='/health';
 res.writeHead(health?200:503,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({ok:false,ready:false,mode:'build-verification-only',archiveVerified:true,dependenciesVerified:true,processingEnabled:false,synthetic}));
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
