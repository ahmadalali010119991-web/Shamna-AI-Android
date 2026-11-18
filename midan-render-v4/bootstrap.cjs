'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const HASH='2741fa3592e30d94a17be131fda036eab5ab23ab8ec524b2ba096e935c5f6cf1';
const CIPHER_HASH='5602868b67b16ba4a92497d09e2b3cf5be261a78813b2ec176fda4df6d2040d0';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const keyHex=process.env.MIDAN_ARCHIVE_KEY||'';
delete process.env.MIDAN_ARCHIVE_KEY;
let root;
try{
 if(!/^[a-f0-9]{64}$/.test(keyHex))throw Error('ARCHIVE_KEY_REQUIRED');
 if(typeof process.env.MIDAN_WORKER_KEY!=='string'||process.env.MIDAN_WORKER_KEY.length<32)throw Error('WORKER_KEY_REQUIRED');
 const parts=Array.from({length:6},(_,i)=>fs.readFileSync(path.join(__dirname,'encrypted','part-'+String(i).padStart(2,'0')+'.b64'),'ascii'));
 if(parts.slice(0,5).some(v=>v.length!==409600)||parts[5].length!==74512)throw Error('PART_SIZE');
 const sealed=Buffer.from(parts.join(''),'base64');
 if(sealed.length!==1591883||sha(sealed)!==CIPHER_HASH)throw Error('CIPHER_INTEGRITY');
 const aes=crypto.createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),sealed.subarray(0,12));
 aes.setAAD(Buffer.from('midan-render-artifact-v1'));aes.setAuthTag(sealed.subarray(-16));
 const archive=Buffer.concat([aes.update(sealed.subarray(12,-16)),aes.final()]);
 if(archive.length!==1591855||sha(archive)!==HASH)throw Error('ARCHIVE_INTEGRITY');
 root=fs.mkdtempSync(path.join(os.tmpdir(),'media-worker-'));
 const extraction=[
 'import io,sys,zipfile,pathlib,stat',
 'root=pathlib.Path(sys.argv[1])',
 'allowed={".dockerignore",".gitignore","Dockerfile","README_AR.md","approval.json","approved_branding.py","assets/09_global_bulletin.mp3","assets/10_breaking_point.mp3","assets/13_critical_horizon.mp3","assets/midan_logo.png","remote-client.cjs","remote-protocol.cjs","requirements.lock.txt","streaming_branding.py","transport-adapter.cjs","verify_assets.py","video_branding.py","worker-service.cjs"}',
 'with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:',
 ' entries=z.infolist()',
 ' assert len(entries)==len(allowed) and {e.filename for e in entries}==allowed',
 ' assert sum(e.file_size for e in entries)<16*1024*1024',
 ' for e in entries:',
 '  assert not e.is_dir() and not stat.S_ISLNK(e.external_attr >> 16)',
 '  dest=root/e.filename',
 '  dest.parent.mkdir(parents=True,exist_ok=True)',
 '  dest.write_bytes(z.read(e))',
 ].join('\n');
 const env={...process.env};delete env.MIDAN_WORKER_KEY;
 const extract=spawnSync('python',['-c',extraction,root],{input:archive,env,timeout:15000,stdio:['pipe','ignore','ignore']});
 if(extract.status!==0)throw Error('EXTRACTION');
 archive.fill(0);sealed.fill(0);
 const check=spawnSync('python',['verify_assets.py'],{cwd:root,env,timeout:15000,stdio:'ignore'});
 if(check.status!==0)throw Error('ASSET_INTEGRITY');
 console.info('encrypted archive and all approved assets verified; starting worker');
 const worker=spawn(process.execPath,['worker-service.cjs'],{cwd:root,env:process.env,stdio:'inherit'});
 for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>worker.kill(s));
 worker.on('error',()=>{console.error('worker launch failed');process.exit(1)});
 worker.on('exit',(code)=>{try{fs.rmSync(root,{recursive:true,force:true})}catch{}process.exit(code??1)});
}catch(e){if(root)try{fs.rmSync(root,{recursive:true,force:true})}catch{}console.error('startup blocked:',e.code||e.message);process.exit(1)}
