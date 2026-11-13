/* Original-source article and post imagery. Visual-only enhancement:
   no invented photographs, no loss of cards when a publisher blocks images. */
(function(){
'use strict';
const imageCache=new Map(),pending=new Map(),processed=new WeakSet();
let timer=null,watcher=null;
const safeLink=raw=>{ if(typeof raw!=='string'||!raw.trim())return null;
 try{const u=new URL(raw,location.href);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}
 catch{return null}
};
function attachMedia(card){
 if(processed.has(card)||card.querySelector(':scope > .article-source-media'))return;
 processed.add(card);
 let url,id;
 if(card.matches('.voice-post')){
  const link=card.querySelector('.card-foot a[href]');
  url=safeLink(link?.href);
  id='voice-'+(url||'').slice(-100);
 }else{
  id=card.getAttribute('data-article');
  const a=Array.isArray(articles)?articles.find(x=>String(x.id)===id):null;
  url=safeLink(a?.url);
 }
 if(!url||!id)return;
 const heading=card.querySelector('h3');
 if(!heading)return;
 const figure=document.createElement('figure');figure.className='article-source-media';
 figure.hidden=true;
 const anchor=document.createElement('button');anchor.type='button';anchor.className='midan-card-media-button';anchor.style.cssText='display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in';
 anchor.setAttribute('aria-label','عرض الصورة أو تشغيل الفيديو داخل ميدان الخبر');
 const picture=document.createElement('img');
 picture.alt='صورة مرتبطة بالخبر لدى المصدر الأصلي';
 picture.loading='eager';picture.decoding='async';picture.referrerPolicy='no-referrer';
 anchor.appendChild(picture);figure.appendChild(anchor);
 card.insertBefore(figure,heading);
 const entry={id,url,figure,picture,card};
 if(imageCache.has(url)){display(entry,imageCache.get(url));return}
 card.__midanImageEntry=entry;
 if(watcher)watcher.observe(card);
 else pending.set(url,entry);
 schedule();
}
function display(entry,src){
 if(!entry.figure.isConnected||!src)return;
 const valid=safeLink(src);if(!valid)return;
 const image=entry.picture;image.loading='eager';image.referrerPolicy='no-referrer';
 let fallback=false;
 image.onload=()=>{if(entry.figure.isConnected)entry.figure.hidden=false;};
 image.onerror=()=>{
  if(!fallback){fallback=true;image.src=valid;return}
  entry.figure.hidden=true;imageCache.set(entry.url,null);
 };
 /* Telegram video/photo thumbnails are on a publisher CDN which the image proxy does not allow; load the original directly. */
 const host=new URL(valid).hostname.toLowerCase();
 image.src=/^cdn\d+\.telesco\.pe$/.test(host)?valid:'/api/news?feature=image&url='+encodeURIComponent(valid);
}

function schedule(){
 if(timer)return;
 timer=setTimeout(async()=>{
  timer=null;
  if(!pending.size)return;
  const selected=[...pending.entries()].slice(0,8);
  selected.forEach(([k])=>pending.delete(k));
  const request=selected.map(([,item])=>({id:item.id,url:item.url}));
  try{
   const r=await fetch('/api/news?feature=media',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({articles:request})});
   if(!r.ok)throw new Error('Publisher image request unavailable');
   const data=await r.json();
   if(!Array.isArray(data.images))throw new Error('Bad image metadata response');
   for(const [url,entry] of selected){
    const item=data.images.find(x=>x.id===entry.id);
    const image=safeLink(item?.imageUrl);
    imageCache.set(url,image||null);
    display(entry,image);
   }
  }catch{
   // Retry is allowed after a later refresh; content stays readable.
  }
  if(pending.size)schedule();
 },85);
}
function scan(){
 const cards=document.querySelectorAll('#newsList .news-card[data-article],#voicesPanel .voice-post');
 cards.forEach(attachMedia);
 if(!watcher&&pending.size)schedule();
}
function setup(){
 if('IntersectionObserver' in window){
  watcher=new IntersectionObserver(entries=>{
   for(const event of entries){
    if(!event.isIntersecting)continue;
    watcher.unobserve(event.target);
    const item=event.target.__midanImageEntry;
    if(item&&!imageCache.has(item.url)){pending.set(item.url,item)}
   }
   if(pending.size)schedule();
  },{rootMargin:'700px 0px'});
 }
 const root=document.querySelector('#newsList');
 const voices=document.querySelector('#voicesPanel');
 if('MutationObserver' in window){
  const observer=new MutationObserver(()=>scan());
  for(const node of [root,voices])if(node)observer.observe(node,{childList:true,subtree:true});
 }
 scan();
}
// Detail pages use the same source image, not a substitute image.
if(typeof openArticle==='function'){
 const previousOpen=openArticle;
 openArticle=function(id){
  const result=previousOpen(id);
  const a=Array.isArray(articles)?articles.find(x=>String(x.id)===String(id)):null;
  const modal=document.getElementById('modalContent');
  if(!a||!modal)return result;
  if(a.sourceId==='field-voice'){
   const status=[...modal.querySelectorAll('.detail-source div')].find(x=>
     (x.querySelector('b')?.textContent||'').includes('حالة التحقق'));
   if(status)status.remove();
  }
  const url=safeLink(a.url),header=modal.querySelector('h2');
  if(url&&header){
   const figure=document.createElement('figure');
   figure.className='article-source-media';
   figure.hidden=true;
   const anchor=document.createElement('button');anchor.type='button';anchor.className='midan-card-media-button';anchor.style.cssText='display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in';
   anchor.setAttribute('aria-label','عرض صورة الخبر داخل ميدان الخبر');
   const picture=document.createElement('img');picture.alt='صورة الخبر لدى المصدر الأصلي';
   picture.loading='eager';picture.decoding='async';
   anchor.appendChild(picture);figure.appendChild(anchor);header.insertAdjacentElement('afterend',figure);
   const entry={id:String(a.id),url,figure,picture,card:modal};
   if(imageCache.has(url))display(entry,imageCache.get(url));
   else{pending.set(url,entry);schedule()}
  }
  return result;
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
