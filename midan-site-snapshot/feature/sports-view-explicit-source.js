(function(){
'use strict';
const API='/api/news?section=sports';
function create(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function safeLink(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
function setup(){
 if(document.getElementById('sportsView')||!document.querySelector('.main-area main'))return;
 const style=create('style');style.textContent=`
 #sportsView[hidden]{display:none!important}
 #sportsView{padding:16px 6px 28px;direction:rtl;color:#f4f7fc}
 .m-sports-intro{border:1px solid #315274;border-radius:20px;background:linear-gradient(135deg,#0a2d60,#06142b);padding:22px;margin-bottom:18px}
 .m-sports-intro h2{margin:0 0 10px;color:#f0bc55;font-size:24px}
 .m-sports-intro p{margin:0;color:#d3e4f3;line-height:1.8}
 .m-sports-grid{display:grid;gap:14px}
 .m-sports-card{padding:18px;border:1px solid #315274;border-radius:17px;background:#082437}
 .m-sports-card h3{font-size:19px;line-height:1.75;margin:0 0 10px}
 .m-sports-card p{line-height:1.95;color:#e4edf5;white-space:pre-wrap}
 .m-sports-meta{color:#b4ccdf;font-size:13px}
 .m-sports-source{display:inline-block;margin-top:12px;padding:10px 17px;border:1px solid #f0bc55;border-radius:12px;color:#f0bc55;text-decoration:none}
 .m-sports-empty{padding:22px;border-radius:16px;background:#09293f;line-height:1.9}
 .bottom-nav:has(.m-sports-tab){overflow-x:auto;scrollbar-width:none}
 .bottom-nav .m-sports-tab{min-width:58px}
 `;document.head.append(style);
 const main=document.querySelector('.main-area main'), view=create('section');view.id='sportsView';view.hidden=true;view.setAttribute('aria-label','أخبار الرياضة');const intro=create('div','m-sports-intro');intro.append(create('h2',null,'الرياضة'),create('p',null,'أخبار الرياضيين والمنتخبات والبطولات في قسم مستقل، مرتبة من الأحدث إلى الأقدم.'));const grid=create('div','m-sports-grid');view.append(intro,grid);const foot=main.querySelector('.site-footer');if(foot)main.insertBefore(view,foot);else main.append(view);
 const sidebar=document.getElementById('desktopNav'),bottom=document.querySelector('.bottom-nav');const buttons=[];
 if(sidebar){let btn=create('button','nav-btn m-sports-tab');btn.type='button';btn.innerHTML='<span class="nav-ico" aria-hidden="true">⚽</span> الرياضة';sidebar.insertBefore(btn,sidebar.querySelector('[data-view="saved"]')||null);buttons.push(btn)}
 if(bottom){let btn=create('button','bottom-link m-sports-tab');btn.type='button';btn.innerHTML='<span class="bottom-icon" aria-hidden="true">⚽</span><span>الرياضة</span>';bottom.insertBefore(btn,bottom.querySelector('[data-view="saved"]')||null);buttons.push(btn)}
 if(!buttons.length)return;
 let open=false,loading=null;
 function close(){if(!open)return;open=false;view.hidden=true;buttons.forEach(b=>b.classList.remove('active'));const mainView=document.getElementById('mainView');if(mainView)mainView.hidden=false;}
 async function show(){if(open)return;open=true;for(const id of ['mainView','reportView','settingsView','aboutView']){const el=document.getElementById(id);if(el)el.hidden=true}view.hidden=false;document.querySelectorAll('.nav-btn.active,.bottom-link.active').forEach(b=>b.classList.remove('active'));buttons.forEach(b=>b.classList.add('active'));window.scrollTo({top:0,behavior:'instant'});if(loading)return;grid.replaceChildren(create('div','m-sports-empty','جارٍ تحميل أخبار الرياضة...'));loading=fetch(API,{cache:'no-store'}).then(async res=>{if(!res.ok)throw Error('HTTP '+res.status);return res.json()}).then(data=>{const rows=Array.isArray(data.articles)?data.articles:[];grid.replaceChildren();if(!rows.length){grid.append(create('div','m-sports-empty','لا توجد أخبار رياضية متاحة حاليًا. ستظهر هنا عند ورودها من المصادر.'));return}for(const article of rows){const card=create('article','m-sports-card');card.append(create('h3',null,String(article.title||'خبر رياضي')));const meta=create('div','m-sports-meta');const when=Date.parse(article.publishedAt||'');meta.textContent=[article.source||'المصدر الأصلي',Number.isFinite(when)?new Date(when).toLocaleString('ar',{dateStyle:'medium',timeStyle:'short'}):''].filter(Boolean).join(' • ');card.append(meta);const summary=String(article.summary||'').trim();if(summary)card.append(create('p',null,summary));const url=safeLink(article.url||article.sourceUrl);if(url){const a=create('a','m-sports-source','اقرأ المصدر الأصلي');a.href=url;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}grid.append(card)}}).catch(()=>{grid.replaceChildren(create('div','m-sports-empty','تعذر جلب الأخبار الرياضية الآن. أعد فتح القسم للمحاولة مجددًا.'))}).finally(()=>{loading=null});}
 document.addEventListener('click',event=>{if(event.target.closest('.m-sports-tab')){event.preventDefault();event.stopImmediatePropagation();show();return}if(event.target.closest('[data-view],#aboutSide'))close()},true);
 window.addEventListener('hashchange',()=>{if(location.hash==='#sports')show();else close()});
 if(location.hash==='#sports')show();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
