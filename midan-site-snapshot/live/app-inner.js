/* Compatible dynamic loader + mobile reporting controls. */
(()=>{'use strict';
const original=document.createElement('script');original.src='/app-legacy.js';original.async=false;
original.onload=()=>{
 // Reserve Android status-bar clearance only in embedded/installed WebView.
 if(window.AndroidBridge||/;\s*wv\)/i.test(navigator.userAgent)||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches))document.documentElement.classList.add('midan-android-webview');

 const report=document.getElementById('reportView');if(!report)return;
 const reset=()=>{for(const e of [document.scrollingElement,document.documentElement,document.body])if(e)e.scrollLeft=0;if(!report.hidden)window.scrollTo({top:0,left:0,behavior:'instant'});};
 let visible=!report.hidden;
 new MutationObserver(()=>{const next=!report.hidden;if(next!==visible){visible=next;requestAnimationFrame(reset)}}).observe(report,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('click',ev=>{if(ev.target.closest('[data-view="report"],#reportBack'))requestAnimationFrame(()=>setTimeout(reset,0))},true);
 const about=document.getElementById('aboutView');
 const clean=()=>{if(!about)return;for(const el of about.querySelectorAll('a,button')){const label=(el.textContent||'').trim();if(/التواصل\s*و\s*الدعم|التواصل.*الدعم|الدعم.*التواصل/.test(label)){const parent=el.parentElement;el.remove();if(parent&&!parent.textContent.trim())parent.remove();}}};
 clean();if(about)new MutationObserver(clean).observe(about,{childList:true,subtree:true});
 window.addEventListener('pageshow',()=>{if(!report.hidden)reset()});
 if(document.readyState==='complete'&&'serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
 // Preserve all existing client behaviours and attach the additive newsroom layer.
 const enhancement=document.createElement('script');
 enhancement.src='/enhancements.js';enhancement.async=false;
 enhancement.onerror=()=>console.warn('Optional Arabic newsroom layer unavailable; original interface preserved.');
 document.body.append(enhancement);

};
original.onerror=()=>{const p=document.createElement('p');p.textContent='تعذّر تحميل الواجهة. تحقق من الاتصال ثم حدّث الصفحة.';document.body.append(p)};
document.body.append(original);
})();
/* Render public-source videos inside article details (no video files stored). */
(function(){var mount=function(){if(document.querySelector('script[data-midan-inline-video]'))return;var script=document.createElement('script');script.setAttribute('data-midan-inline-video','v1');script.src='/video-inline.js?v=20261112';script.async=true;document.body.appendChild(script)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount()})();
