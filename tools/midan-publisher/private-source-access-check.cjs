'use strict';
/* Read-only bot membership diagnostic: no channel publication or mutation. */
async function call(method,data,token){
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(14000)
 });
 const v=await r.json().catch(()=>({ok:false,description:'Invalid JSON'}));
 return {ok:!!v.ok,result:v.result||null,error:v.ok?null:String(v.description||r.status).slice(0,160)};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const token=process.env.TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,reason:'bot_not_configured'});
 try{
  const who=await call('getMe',{},token);
  if(!who.ok||!who.result?.id)return res.status(502).json({ok:false,reason:'bot_identity_failed'});
  const chat=await call('getChat',{chat_id:'@Private_Source99'},token);
  const member=await call('getChatMember',{chat_id:'@Private_Source99',user_id:who.result.id},token);
  const status=member.result?.status||'unavailable';
  return res.status(200).json({
    ok:true,channelFound:!!chat.ok,botMembership:status,
    canPost:status==='creator'||(status==='administrator'&&member.result?.can_post_messages===true),
    botCanReadPublicPage:true,
    channelError:chat.error||null,membershipError:member.error||null
  });
 }catch(e){return res.status(503).json({ok:false,reason:String(e.message).slice(0,120)})}
};