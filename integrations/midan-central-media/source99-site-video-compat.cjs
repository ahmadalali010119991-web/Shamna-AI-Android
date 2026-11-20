'use strict';
/**
 * Source99 website original-video resilience.
 * Keeps the original signed/public Telegram CDN link validation and byte range
 * magic-number check. Generic content types are allowed only after the same
 * original MP4 signature test. If the temporary CDN file is not playable,
 * fallback to the verified PUBLIC ORIGINAL Telegram post embed, not a
 * fabricated image or unrelated video.
 */
const fs=require('node:fs'),Module=require('node:module');
const filename=require.resolve('./private-source99-video-legacy.cjs');
let src=fs.readFileSync(filename,'utf8');
function replaceOne(oldText,newText){
 if(src.split(oldText).length!==2)throw Error('SOURCE99_SITE_VIDEO_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 src=src.replace(oldText,newText);
}
replaceOne("if((response.headers.get('content-type')||'').split(';')[0].toLowerCase()!=='video/mp4')return false;",
 "const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();\n"+
 "  if(!['video/mp4','binary/octet-stream','application/octet-stream'].includes(mime))return false;");
replaceOne(
 "const url=candidateFromHtml(html,m[1]);\n if(!url||!await playable(url,fetcher))return null;\n return {kind:'mp4',url,sourceUrl:original.sourceUrl};",
 [
  "const url=candidateFromHtml(html,m[1]);",
  "try{if(url&&await playable(url,fetcher))return {kind:'mp4',url,sourceUrl:original.sourceUrl}}catch{}",
  "const post=html.split(/<div class=\"tgme_widget_message_wrap\\b/).slice(1)",
  " .find(s=>s.includes('data-post=\"Private_Source99/'+m[1]+'\"'));",
  "if(!post||!/tgme_widget_message_video|<video\\b|<source\\b/i.test(post))return null;",
  "return {kind:'embed',url:'https://t.me/Private_Source99/'+m[1]+'?embed=1',sourceUrl:original.sourceUrl};"
 ].join('\n')
);
const child=new Module(filename,module);
child.filename=filename;child.paths=module.paths;
child._compile(src,filename);
module.exports=child.exports;
