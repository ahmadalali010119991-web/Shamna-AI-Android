/**
 * Midan Al Khabar — delivery decision adapter (not installed on live bridge yet).
 * Must be connected to a durable news+channel keyed queue and audited before use.
 */
export const RETRY_LIMIT=3;
export const PHOTO_CAPTION_LIMIT=1024;
export const MESSAGE_LIMIT=4096;
export const VERIFIED_VOICES=Object.freeze([
  "عهد الصليبي","صهيب الجابر","زين العابدين العكيدي",
  "صهيب اليعربي","أمجد الساري","إبراهيم الحبش"
]);
export function classify(item) {
  const category=String(item.category||"").trim().toLowerCase();
  if(["sports","sport","رياضة","رياضي"].includes(category))return "sports";
  if(category && !["general","news","عام","أخبار"].includes(category))return category;
  return "general"; // Do not silently infer sports solely from a player's name
}
export function attributableSource(item) {
  const name=String(item.author||item.sourceName||"").normalize("NFKC").trim();
  if(VERIFIED_VOICES.includes(name))return {label:"المصدر: "+name,removeGenericCirculationLabel:true};
  return {label:name?"المصدر: "+name:"المصدر غير محدد",removeGenericCirculationLabel:false};
}
export function decision(job) {
  if(!job?.newsId || !job.channelId)throw Error("immutable newsId and channelId required");
  if(job.approved!==true)return {action:"hold",reason:"not_approved"};
  if(classify(job)==="sports" && job.destination!=="sports")return {action:"skip",reason:"sports_only"};
  if(job.imageUrl && job.imageVerified===true)return {action:"photo"};
  if(job.originalHadPhoto===true && Number(job.photoAttempts||0)<RETRY_LIMIT)
    return {action:"retry_photo",retryAfterSeconds:Math.min(60*2**Number(job.photoAttempts||0),900)};
  return {action:"text",reason:job.originalHadPhoto?"photo_unavailable_after_retries":"no_photo"};
}
export function messagePayload(job,route) {
  if(!["photo","text"].includes(route?.action))throw Error("unpublishable state");
  const text=String(job?.publishText||"").trim();
  if(!text)throw Error("news body required");
  // Do not truncate silently or send unrecognized keys to Telegram.
  if(route.action==="photo" && [...text].length<=PHOTO_CAPTION_LIMIT)
    return {method:"sendPhoto",chat_id:job.channelId,photo:job.imageUrl,caption:text};
  if([...text].length>MESSAGE_LIMIT) return {method:"split_required",body:text};
  return {method:"sendMessage",chat_id:job.channelId,text};
}
export function receipt(result) {
  if(result?.ok===true && Number.isSafeInteger(result?.result?.message_id))
    return {state:"sent",messageId:result.result.message_id};
  if(Number(result?.error_code)===429)return {state:"retry",afterSeconds:Math.max(1,Number(result?.parameters?.retry_after)||60)};
  if([400,403].includes(Number(result?.error_code)))
    return {state:"manual_review",error:String(result.description||"rejected").slice(0,250)};
  return {state:"reconcile_before_retry",error:String(result?.description||"ambiguous").slice(0,250)};
}
