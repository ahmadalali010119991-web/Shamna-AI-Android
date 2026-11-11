'use strict';
// Owner-approved 53 original images; one random post every day at 20:30
// Asia/Damascus. Atomic Supabase dispatch locks and full-cycle shuffle.
const crypto=require('node:crypto');
const rates=require('./rates-publisher');
const messages=require('./awareness-53.json');
const TITLES=["العودة إلى مصادر القوة","حضور الحق بالبيان والقدوة","العلم والبصيرة أساس النهوض","مكانة الأب وخبرته","التاريخ مصدر ثقة للمستقبل","الإنصاف في تاريخ العلوم","حضارة صنعت المعرفة","الذاكرة العلمية لا تُمحى","التعليم وصناعة الوعي","من مهّد للاكتشاف؟","استعادة الثقة بالعلم","من يكتب التاريخ؟","الاستقلال الاقتصادي والمعرفي","اللغة ذاكرة الأمة","سلسلة الاكتشاف العلمي","حماية اللغة والهوية","العدل في نسبة الإنجازات","الكيمياء وتجارب العلماء","قصة دراسة الثقل","الإسهام الحضاري الأصيل","الآلات وابتكار المسلمين","قراءة منصفة لتاريخ الاستعمار","ابن الهيثم وأسس البصريات","العلم جهد تراكمي","ابن النفيس والدورة الدموية","الأخذ من العلوم وتطويرها","تاريخ قياس سرعة الضوء","تعليم الأبناء السؤال","الحضارة والحقوق والعمل","احمِ انتباهك","لا تجعل الانتشار دليلًا","بصيرة مستقلة","فهم الدين وإقامة الحجة","ثبات البصيرة","قوة الحجة وحسن البيان","الإصلاح يبدأ من الذات","الإنصاف في الحكم على الأشخاص","الاحتكام إلى الدليل","الإصلاح رغم التقصير","فتح أبواب التوبة","الرفيق الذي يعينك على الخير","الحفظ والفهم والعمل","المعرفة في مواجهة التشويه","هوية الشاب ووقته","العدل لا تحدده القوة","وعي بلا تهويل","حقوق المرأة والجدل المعاصر","من الوعي إلى العمل","الإسلام والعلم","إصلاح الداخل أولًا","الدين منهج حياة","حماية الشباب بالمعنى والغاية","الأسرة والمدرسة ومسؤولية الإجابة"];
const PREFIX='https://dallalna-telegram-bridge.vercel.app/awareness/';
const ROTATION='state/midan-awareness-53-rotation-v1';
const N=53;
function windowFor(now=new Date()){
 const d=rates.stamp(now);
 if(d.hour!==20||d.minute<30||d.minute>45)return null;
 return {date:d.date,slot:'20:30',zone:'Asia/Damascus'};
}
function shuffle(last=-1){
 const result=Array.from({length:N},(_,i)=>i);
 for(let i=N-1;i>0;i--){let j=crypto.randomInt(i+1);[result[j],result[i]]=[result[i],result[j]]}
 if(last>=0&&result[0]===last)[result[0],result[1]]=[result[1],result[0]];
 return result;
}
function validRotation(s){
 return Boolean(s&&Array.isArray(s.order)&&s.order.length===N&&new Set(s.order).size===N
   &&s.order.every(n=>Number.isInteger(n)&&n>=0&&n<N)
   &&Number.isInteger(s.index)&&s.index>=0&&s.index<=N
   &&Number.isInteger(s.last)&&s.last>=-1&&s.last<N);
}
function filename(index){return 'Midan_AlKhabar_Message_'+String(index+1).padStart(2,'0')+'.png'}
function caption(index){
 if(!Number.isInteger(index)||index<0||index>=N||messages.length!==N||TITLES.length!==N)throw Error('Invalid 53-message manifest');
 const original=String(messages[index]).replace(/\s+/g,' ').trim();
 const excerpt=original.length>680?original.slice(0,677).trimEnd()+'…':original;
 const msg='🌿 <b>رسالة توعوية | '+TITLES[index].replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</b>\n\n'
   +excerpt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   +'\n\n📚 <b>مقتطف من مشروع الإسلام المتعب</b>\n'
   +'#ميدان_الخبر #الإسلام_المتعب #رسائل_توعوية';
 if(msg.length>1024)throw Error('Telegram caption exceeds 1024 characters');
 return msg;
}
async function nextChoice(){
 const r=await rates.stateCall('read',ROTATION);
 const prior=r.found?r.record:null;
 let state=prior?.value;
 if(!validRotation(state))state={order:shuffle(),index:0,last:-1};
 if(state.index===N)state={order:shuffle(state.last),index:0,last:state.last};
 const number=state.order[state.index];
 return {number,priorVersion:prior?.updated_at||null,
    next:{order:state.order,index:state.index+1,last:number}};
}
async function downloadOriginal(index){
 const source=PREFIX+filename(index);
 const r=await fetch(source,{signal:AbortSignal.timeout(21000),cache:'no-store'});
 if(!r.ok)throw Error('Original owner image not hosted: '+filename(index)+' HTTP '+r.status);
 const len=Number(r.headers.get('content-length')||0);
 if(len>3_000_000)throw Error('Awareness photo exceeds expected original bounds');
 const b=Buffer.from(await r.arrayBuffer());
 if(b.length<1_000_000||b.length>3_000_000||
   b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
   b.readUInt32BE(16)!==1254||b.readUInt32BE(20)!==1254)
  throw Error('Invalid original awareness PNG '+filename(index));
 return b;
}
async function send(index,bytes){
 const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chat)throw Error('Channel credentials unavailable');
 const form=new FormData();
 form.append('chat_id',chat);
 form.append('photo',new Blob([bytes],{type:'image/png'}),filename(index));
 form.append('caption',caption(index));form.append('parse_mode','HTML');
 const response=await fetch('https://api.telegram.org/bot'+token+'/sendPhoto',
  {method:'POST',body:form,signal:AbortSignal.timeout(40000)});
 const json=await response.json().catch(()=>({}));
 if(!response.ok||json.ok!==true||!Number.isInteger(json.result?.message_id))
  throw Error('Telegram declined awareness photo '+response.status+': '+String(json.description||'').slice(0,120));
 return json.result;
}
async function run({now=new Date()}={}){
 if(process.env.MIDAN_AWARENESS_ENABLED!=='true')return {status:'disabled',reason:'All 53 photo assets must be hosted before enabling'};
 const window=windowFor(now);if(!window)return {status:'skipped',reason:'Outside 20:30 Damascus window'};
 const key='once/midan-awareness-53:'+window.date;
 const prior=await rates.stateCall('read',key);
 if(prior?.record?.completed_at)return {status:'duplicate',date:window.date};
 const choice=await nextChoice();
 const buffer=await downloadOriginal(choice.number); // do not acquire lease if file absent
 const lease=await rates.stateCall('claim',key,{}, {lease_seconds:300});
 if(!lease.ok)return {status:'duplicate',date:window.date};
 const lease_id=lease.record?.lease_id;
 if(!lease_id)throw Error('Awareness claim missing atomic lease');
 let receipt;
 try{receipt=await send(choice.number,buffer)}catch(err){
  if(/^Telegram declined awareness photo /.test(String(err.message)))
   await rates.stateCall('release',key,{}, {lease_id}).catch(()=>{});
  throw err;
 }
 const record={date:window.date,message_id:receipt.message_id,
  chat_id:String(receipt.chat.id),image:filename(choice.number),imageIndex:choice.number+1,
  sha256:crypto.createHash('sha256').update(buffer).digest('hex'),sentAt:new Date().toISOString()};
 let done=false,problem;
 for(let i=0;i<3;i++){
  try{const result=await rates.stateCall('complete',key,record,{lease_id});if(result.ok){done=true;break}problem=new Error(result.status)}
  catch(e){problem=e}
  if(i<2)await new Promise(resolve=>setTimeout(resolve,500*(i+1)));
 }
 if(!done)throw Error('Already published but cannot persist receipt: '+String(problem?.message));
 const saved=await rates.stateCall('write',ROTATION,choice.next,
    choice.priorVersion?{expected_updated_at:choice.priorVersion}:{});
 if(!saved.ok)throw Error('Image delivered but rotation CAS failed; investigate before next daily run');
 return {status:'sent',date:window.date,messageId:receipt.message_id,imageIndex:choice.number+1};
}
module.exports={windowFor,shuffle,validRotation,caption,filename,run};
