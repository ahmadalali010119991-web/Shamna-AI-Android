/* Additive Arabic presentation and attributed "Voices of the Field" UI. */
(function(){
'use strict';
if(typeof nav!=='function'||typeof renderFeed!=='function'||typeof articleCard!=='function')return;
const state={voices:null,voicesAt:0,voicesLoading:false,pending:new Set(),retry:new Map(),timer:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return ''}}
function isArabic(s){return (String(s||'').match(/[\u0600-\u06FF]/g)||[]).length>=8}
const refugeeWords=/لاجئ|لاجئين|لجوء|مهاجر|هجرة|نازح|ترحيل|إقامة|إعادة التوطين|مخيم|طالبي الحماية|refugee|asylum|migrant|deport|immigra|displac|göçmen|sığınmacı|mülteci|iltica|flüchtling|asyl/i;
const unrelatedSubjects=/\b(?:president|prosecutor|impeachment|senate|bankruptcy|banking scandal|football|sports)\b|عزل رئيس|رئيس باراغواي|محاكمة رئيس|إقالة رئيس|فضيحة مصرفية/i;
const oldSelect=selectArticles;
selectArticles=function(){const a=oldSelect();return view==='refugees'?a.filter(x=>{
 const text=[x.originalTitle||x.title,x.originalSummary||x.summary].join(' ');
 // Fail open for ambiguous stories: hide only a confidently unrelated misclassification.
 return refugeeWords.test(text)||!unrelatedSubjects.test(text);
}):a};
const oldCard=articleCard;
articleCard=function(a){
 let shown=a;
 if(a.language&&a.language!=='ar'&&!a.translationType){
  shown=Object.assign({},a,{title:'خبر من '+(a.source||'مصدر أجنبي')+' — الترجمة العربية قيد الإعداد',
    summary:'يُترجم هذا الخبر إلى العربية مع المحافظة على رابط المصدر والنص الأصلي. يمكنك فتح التفاصيل لمراجعة المصدر.'});
 }
 let h=oldCard(shown);
 if(a.translationType==='machine'){
  h=h.replace('<h3 tabindex=','<div class="arabic-translation-note">ترجمة عربية آلية للمعنى؛ ليست تحققًا مستقلًا من الخبر. الأصل متاح عبر المصدر.</div><h3 tabindex=');
 }
 return h;
};
function cacheKey(a){return 'midan-translation-'+a.id+'-'+String(a.originalTitle||a.title).slice(0,18)}
function readCached(a){
 try{
  const c=JSON.parse(localStorage.getItem(cacheKey(a))||'null');
  return c&&Date.now()-c.at<604800000&&isArabic(c.title)&&isArabic(c.summary)?c:null
 }catch{return null}
}
function apply(a,t){
 if(!a||!t||!isArabic(t.title)||!isArabic(t.summary))return;
 if(!a.originalTitle)a.originalTitle=a.title;
 if(!a.originalSummary)a.originalSummary=a.summary;
 a.title=t.title;a.summary=t.summary;a.translationType='machine';
 try{localStorage.setItem(cacheKey(a),JSON.stringify({title:t.title,summary:t.summary,at:Date.now()}))}catch{}
}
function translateLater(){
 if(state.timer)return;
 state.timer=setTimeout(function(){state.timer=null;translateVisible().catch(()=>{})},140);
}
async function translateVisible(){
 if(view==='voices'||['settings','about','report'].includes(view))return;
 const picked=selectArticles().slice(0,Math.max(12,showCount)).filter(a=>a.language&&a.language!=='ar'&&!a.translationType&&!state.pending.has(a.id)&&!(state.retry.get(a.id)>Date.now())).slice(0,3);
 if(!picked.length)return;
 for(const a of picked){const c=readCached(a);if(c)apply(a,c)}
 const request=picked.filter(a=>!a.translationType);
 if(!request.length){renderFeed();return}
 request.forEach(a=>state.pending.add(a.id));
 try{
  const resp=await fetch('/api/news?feature=translate',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({articles:request.map(a=>({id:a.id,title:a.originalTitle||a.title,summary:a.originalSummary||a.summary,language:a.language}))})});
  if(!resp.ok)throw Error('translate unavailable');
  const data=await resp.json();
  for(const a of request){
   const tr=(data.translations||[]).find(x=>x.id===a.id&&x.ok);
   if(tr)apply(a,tr);else state.retry.set(a.id,Date.now()+300000);
  }
 }catch{request.forEach(a=>state.retry.set(a.id,Date.now()+300000))}
 finally{
  request.forEach(a=>state.pending.delete(a.id));
  if(view!=='voices')oldRender();
  const remaining=selectArticles().slice(0,Math.max(12,showCount)).some(a=>a.language&&a.language!=='ar'&&!a.translationType&&!state.pending.has(a.id)&&!(state.retry.get(a.id)>Date.now()));
  if(remaining)translateLater();
 }
}
const toolbar=$('.toolbar');if(!toolbar)return;
const panel=document.createElement('section');panel.id='voicesPanel';panel.className='voices-panel';panel.hidden=true;panel.setAttribute('aria-label','أصوات الميدان');
toolbar.insertAdjacentElement('afterend',panel);
const layout=$('.news-layout'),filters=$('.filter-wrap');
const oldRender=renderFeed;
function setVoices(visible){
 panel.hidden=!visible;
 if(layout)layout.style.display=visible?'none':'';
 if(filters)filters.style.display=visible?'none':'';
 if(visible&&$('#viewTitle'))$('#viewTitle').textContent='أصوات الميدان';
}
renderFeed=function(){
 if(view==='voices'){setVoices(true);renderVoices();return}
 setVoices(false);
 const result=oldRender();
 translateLater();
 return result;
};
function addButton(selector,markup){
 const p=$(selector);if(!p||p.querySelector('[data-view="voices"]'))return;
 p.insertAdjacentHTML('beforeend',markup);
 const b=p.querySelector('[data-view="voices"]');
 b.addEventListener('click',()=>nav('voices'));
}
addButton('.editorial-hubs','<button type="button" data-view="voices">🎙️ أصوات الميدان</button>');
addButton('#desktopNav','<button type="button" class="nav-btn" data-view="voices"><span class="nav-ico">🎙</span> أصوات الميدان</button>');
const oldNav=nav;
nav=function(to){const r=oldNav(to);setVoices(to==='voices');if(to==='voices')renderVoices();return r};
function profileCard(p){
 let url=link(p.url);
 return '<article class="voice-person"><div class="voice-person-head"><strong>'+esc(p.name)+'</strong><span class="voice-pill '+(p.status==='pending_identity'?'pending':'')+'">'+(p.status==='pending_identity'?'المصدر قيد التوثيق':'مصدر منشور معلوم')+'</span></div><p>'+esc(p.description)+'</p><div class="voice-person-foot"><span>'+esc(p.outlet)+'</span>'+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">المصدر الأصلي ↗</a>':'')+'</div></article>';
}
function postCard(x){
 return '<article class="news-card voice-post"><div class="card-meta"><span class="meta-badge source">'+(x.kind==='archive'?'مادة مؤرشفة':'منشور من المصدر')+'</span><time datetime="'+esc(x.publishedAt)+'">'+esc(stamp(x.publishedAt))+'</time></div><div class="voice-byline">✍️ '+esc(x.author)+'</div><h3>'+esc(x.title)+'</h3><p class="card-desc">'+esc(x.summary)+'</p><div class="card-foot"><span class="source-name">'+esc(x.source)+'</span><a class="mini-btn" href="'+esc(link(x.url))+'" target="_blank" rel="noopener noreferrer">اقرأ المصدر الأصلي ↗</a></div></article>';
}
function renderVoices(){
 if(view!=='voices')return;
 if(!state.voices){
  panel.innerHTML='<div class="citizen-notice"><strong>جارٍ تحميل منشورات المصادر…</strong></div>';
  fetchVoices();return;
 }
 const d=state.voices;
 panel.innerHTML=
  '<div class="voices-people">'+(d.profiles||[]).map(profileCard).join('')+'</div>'+
  '<h3 class="voices-latest-heading">المنشورات المتاحة من المصادر المحددة</h3>'+
  ((d.items||[]).length?(d.items||[]).slice().sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).map(postCard).join(''):'<div class="empty-state"><p>لا تتوفر الآن منشورات مناسبة للعرض الآلي. يمكن مراجعة المواد الأصلية من روابط أصحابها أعلاه.</p></div>')+
  '<h3 class="voices-latest-heading">أعمال منشورة سابقًا — أرشيف بالتاريخ الأصلي</h3>'+
  (d.archive||[]).slice().sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).map(postCard).join('');
}
async function fetchVoices(){
 if(state.voicesLoading||Date.now()-state.voicesAt<600000)return;
 state.voicesLoading=true;
 try{
  const r=await fetch('/api/news?feature=voices',{cache:'no-store'});
  if(!r.ok)throw Error('voices');
  const d=await r.json();
  if(!Array.isArray(d.profiles)||!Array.isArray(d.items))throw Error('voices data');
  state.voices=d;state.voicesAt=Date.now();
 }catch{state.voices={profiles:[],items:[]};state.voicesAt=Date.now()-540000}
 finally{state.voicesLoading=false;renderVoices()}
}
renderFeed();
})();



/* Load independent enhancements consecutively to preserve existing behavior. */
(function(){
 const files=['/geo-unified.js','/world-regions.js','/native-push-ui.js','/source-images.js','/refugees-live.js','/midan-editorial.js'];
 function load(n){
  if(n>=files.length)return;
  const script=document.createElement('script');
  script.src=files[n];
  script.async=false;
  script.onload=()=>load(n+1);
  script.onerror=()=>{console.warn('Optional enhancement unavailable:',files[n]);load(n+1)};
  document.head.appendChild(script);
 }
 load(0);
})();
