(function(){
'use strict';
const view=document.getElementById('modalContent');if(!view)return;
const cache=new Map();let lastId='',running=false;
const style=document.createElement('style');
style.textContent='.midan-original-video{margin:18px 0;border:1px solid #3b6385;border-radius:16px;background:#06142b;overflow:hidden}.midan-original-video .m-caption{font-size:13px;color:#d9e7f5;padding:9px 13px}.midan-original-video video{width:100%;max-height:72vh;background:#000;display:block}.midan-original-video iframe{width:100%;aspect-ratio:16/9;border:0;display:block;background:#000}';
document.head.appendChild(style);
function player(data){
 const area=document.createElement('figure');area.className='midan-original-video';
 const medium=data.kind==='mp4'?document.createElement('video'):document.createElement('iframe');
 if(data.kind==='mp4'){medium.controls=true;medium.preload='metadata';medium.playsInline=true;medium.setAttribute('controlsList','nodownload')}else{medium.loading='lazy';medium.allowFullscreen=true;medium.title='الفيديو الأصلي للخبر';medium.referrerPolicy='strict-origin-when-cross-origin';medium.allow='encrypted-media; picture-in-picture; fullscreen';}
 medium.src=data.url;
 const caption=document.createElement('figcaption');caption.className='m-caption';caption.textContent='فيديو الخبر من المصدر الأصلي';
 area.append(medium,caption);return area;
}
async function check(){
 if(running||document.getElementById('overlay')?.hidden)return;
 const id=view.querySelector('[data-save]')?.getAttribute('data-save');
 if(!id||id===lastId||view.querySelector('.news-video,.video-frame,.midan-original-video'))return;
 lastId=id;running=true;
 try{
  let data=cache.get(id);
  if(!data){const r=await fetch('/api/article-video?id='+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)throw Error('Video metadata unavailable');data=await r.json();cache.set(id,data)}
  if(!data.ok||!['mp4','embed'].includes(data.kind)||lastId!==id||document.getElementById('overlay')?.hidden)return;
  const save=view.querySelector('[data-save]');if(!save||save.getAttribute('data-save')!==id)return;
  if(view.querySelector('.news-video,.video-frame,.midan-original-video'))return;
  const element=player(data),source=view.querySelector('.detail-source');
  if(source)view.insertBefore(element,source);else view.appendChild(element);
 }catch(e){console.warn('Optional original news video unavailable')}
 finally{running=false}
}
new MutationObserver(()=>{if(document.getElementById('overlay')?.hidden){lastId='';return}queueMicrotask(check)}).observe(view,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(e.target.closest('[data-open],.news-card,[data-article]'))setTimeout(check,0)},true);
})();
