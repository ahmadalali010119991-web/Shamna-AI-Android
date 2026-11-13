'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'midan-mime-compat-'));
const wrapper=fs.readFileSync(path.join(__dirname,'news-video-mime-compat.cjs'),'utf8');
const marker="&& !mime.includes('application/octet-stream')";
const fixture="'use strict';\nconst accept='video/mp4,video/*';\nmodule.exports={accepts(mime){if(accept.startsWith('video/') && !mime.includes('video/mp4') "+marker+")throw Error('Not a direct playable MP4');return true}};\n";
try{
 fs.writeFileSync(path.join(tmp,'news-original-video.js'),wrapper);
 fs.writeFileSync(path.join(tmp,'news-original-video-legacy.cjs'),fixture);
 const m=require(path.join(tmp,'news-original-video.js'));
 assert.equal(m.accepts('video/mp4'),true);
 assert.equal(m.accepts('application/octet-stream'),true);
 assert.equal(m.accepts('binary/octet-stream'),true,'official CDN MIME now accepted');
 assert.throws(()=>m.accepts('text/html'),/Not a direct playable MP4/);
 fs.writeFileSync(path.join(tmp,'bad.js'),wrapper);
 fs.writeFileSync(path.join(tmp,'news-original-video-legacy.cjs'),"'use strict';module.exports={};");
 assert.throws(()=>{require(path.join(tmp,'bad.js'))},/PATCH_ANCHOR/);
 console.log('PASS: production MIME compatibility and unexpected upstream changes fail closed');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
