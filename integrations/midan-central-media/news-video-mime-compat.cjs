'use strict';
/**
 * Compatibility wrapper for a deployed Midan video publisher.
 * Original byte-for-byte source must be copied alongside this wrapper as
 * ./news-original-video-legacy.cjs. The exact one-line content-type allowlist
 * is adjusted; the existing MP4 signature check remains unchanged.
 * Trusted local code only; no remote/user-supplied source is compiled.
 */
const fs=require('node:fs');
const Module=require('node:module');
const filename=require.resolve('./news-original-video-legacy.cjs');
const source=fs.readFileSync(filename,'utf8');
const marker="&& !mime.includes('application/octet-stream')";
if(source.split(marker).length!==2)
 throw Error('MIDAN_VIDEO_MIME_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
const patched=source.replace(marker,marker+" && !mime.includes('binary/octet-stream')");
const originalModule=new Module(filename,module);
originalModule.filename=filename;
originalModule.paths=module.paths;
originalModule._compile(patched,filename);
module.exports=originalModule.exports;
