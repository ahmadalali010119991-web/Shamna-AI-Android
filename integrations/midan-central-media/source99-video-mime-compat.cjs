'use strict';
/**
 * Production-compatible Source99 original video MIME adjustment.
 * Byte-for-byte original publisher must reside next to this wrapper as
 * source99-direct-publisher-legacy.cjs. Only video octet MIME is extended,
 * and only after MP4 header verification; images remain untouched.
 */
const fs=require('node:fs');
const Module=require('node:module');
const filename=require.resolve('./source99-direct-publisher-legacy.cjs');
let src=fs.readFileSync(filename,'utf8');
function change(anchor,replacement){
 if(src.split(anchor).length!==2)throw Error('SOURCE99_MIME_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 src=src.replace(anchor,replacement);
}
const type="const type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();";
change(type,"let type=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();");
const allow="const valid=video?['video/mp4','video/webm','video/quicktime']:";
change(allow,"const valid=video?['video/mp4','video/webm','video/quicktime','binary/octet-stream','application/octet-stream']:");
const bytes="const buf=new Uint8Array(arr);";
change(bytes,bytes+"\n if(video&&(type==='binary/octet-stream'||type==='application/octet-stream')){\n  if(buf.length<16||String.fromCharCode(...buf.slice(4,8))!=='ftyp')\n   throw Error('INVALID_VIDEO_SIGNATURE');\n  type='video/mp4';\n }");
// A successful Telegram HTTP response is not proof a VIDEO was attached.
// Confirm the actual Telegram file_id before the idempotency queue marks sent.
change("  return data.result;\n }",
 "  if(method==='sendVideo'&&!data.result?.video?.file_id)throw Error('TELEGRAM_VIDEO_RECEIPT_MISSING');\\n".replace('\\n','\n')+
 "  if(method==='sendPhoto'&&!data.result?.photo?.some(p=>!!p.file_id))throw Error('TELEGRAM_PHOTO_RECEIPT_MISSING');\\n".replace('\\n','\n')+
 "  return data.result;\\n }".replace('\\n','\n'));
const child=new Module(filename,module);
child.filename=filename;
child.paths=module.paths;
child._compile(src,filename);
module.exports=child.exports;
