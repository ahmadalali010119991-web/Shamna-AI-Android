'use strict';
/**
 * Patch the deployed article-video handler in place. All existing France24,
 * Euronews and trusted source-video classification remains unchanged.
 * Only when the source has NO playable video, use a verified matching public
 * native video Telegram message. Binary files are never copied to Vercel.
 */
const fs=require('node:fs'),Module=require('node:module');
const file=require.resolve('./article-video-legacy.cjs');
let original=fs.readFileSync(file,'utf8');
function patchOnce(before,after){
 if(original.split(before).length!==2)
  throw Error('MIDAN_SITE_EPHEMERAL_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 original=original.replace(before,after);
}
const fallback="require('./telegram-native-video-site-fallback')";
patchOnce(
 "const value=video?{ok:true,...video,source}:{ok:false,reason:'no_embeddable_video'};",
 "const cachedTelegram=video?null:await "+fallback+".resolve(source).catch(()=>null);\n"+
 "  const value=video?{ok:true,...video,source}:cachedTelegram?{ok:true,...cachedTelegram,source}:{ok:false,reason:'no_embeddable_video'};"
);
patchOnce(
 "}catch(e){return {ok:false,reason:'source_unavailable'}}",
 "}catch(e){\n"+
 "  const telegram=await "+fallback+".resolve(source).catch(()=>null);\n"+
 "  return telegram?{ok:true,...telegram,source}:{ok:false,reason:'source_unavailable'};\n"+
 " }"
);
// Allow a newly published channel video to be found shortly after the site's
// original-source metadata returned a negative. Positive entries stay cached.
patchOnce(
 "if(cached&&Date.now()-cached.time<1800000)return cached.value;",
 "if(cached&&Date.now()-cached.time<(cached.value?.ok?1800000:20000))return cached.value;"
);
const child=new Module(file,module);
child.filename=file;
child.paths=module.paths;
child._compile(original,file);
module.exports=child.exports;
