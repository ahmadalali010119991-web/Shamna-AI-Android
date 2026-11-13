/* WebView back navigation guard: native MainActivity uses web.canGoBack()/web.goBack().
   Keep a same-document history entry so back first dismisses media/detail/section,
   and never closes the activity from its home screen. */
(function(){
"use strict";
if(window.__MIDAN_BACK_GUARD_V1__)return;
window.__MIDAN_BACK_GUARD_V1__=true;
const tag="__midan_back_guard__",slot={};
let busy=false,expected=false,created=false;
function sameDoc(){
 try{return new URL(location.href).origin===location.origin}catch{return false}
}
function goHome(){
 const active=document.querySelector(".bottom-link.active[data-view],.nav-btn.active[data-view]");
 if(active&&active.dataset.view!=="home"){const home=document.querySelector(".bottom-link[data-view='home'],.nav-btn[data-view='home']");home?.click();return true}
 const alternative=document.querySelector("#homeView");
 if(alternative?.hidden===true){document.querySelector("[data-view='home']")?.click();return true}
 return false
}
function goBackInApp(){
 if(window.MidanMediaViewer&&document.querySelector(".midan-media-viewer:not([hidden])")){window.MidanMediaViewer.close();return"media"}
 const selector="[data-mid-close],.mcs-close,[data-mcs-close]";
 const top=document.querySelector(".mcs-modal:not([hidden]),#mcs-modal:not([hidden])");
 if(top){top.querySelector(selector)?.click();return"image-studio"}
 const overlay=document.getElementById("overlay");
 if(overlay&&!overlay.hidden){const btn=overlay.querySelector("[data-close]");if(btn)btn.click();else overlay.hidden=true;return"article"}
 if(goHome())return"home";
 // At home, deliberately stay within the app.
 return"stay";
}
function insertGuard(){
 if(!sameDoc())return;
 try{
  const state=Object.assign({},history.state&&typeof history.state==="object"?history.state:{});
  state[tag]=true;
  history.pushState(state,"",location.href);
  created=true
 }catch(e){console.warn("Midan history guard unavailable",e)}
}
window.addEventListener("popstate",function(ev){
 if(busy)return;
 busy=true;
 try{goBackInApp()}finally{
  // Restore the one synthetic same-page entry for Android WebView's canGoBack().
  // pushState does not navigate or cause recursive popstate events.
  insertGuard();
  busy=false
 }
},true);
document.addEventListener("keydown",function(e){
 if(e.key!=="Escape"||!created)return;
 if(document.querySelector(".midan-media-viewer:not([hidden])"))return;
 e.preventDefault();goBackInApp()
},true);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",insertGuard,{once:true});else insertGuard();
window.MidanBackGuard={back:goBackInApp,installed:()=>created};
})();