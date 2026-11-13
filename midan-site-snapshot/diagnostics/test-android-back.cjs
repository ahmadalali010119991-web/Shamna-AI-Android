const {chromium}=require("playwright"),fs=require("fs");
(async()=>{
const browser=await chromium.launch({headless:true});
try{
 const c=await browser.newContext({viewport:{width:420,height:860},userAgent:"Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 MidanAlKhabarApp/1.3.9"});
 const p=await c.newPage();const errors=[];p.on("pageerror",e=>errors.push(e.message));
 await p.goto("https://midan-al-khabar.vercel.app/",{waitUntil:"domcontentloaded",timeout:60000});
 await p.addScriptTag({content:fs.readFileSync("midan-site-snapshot/feature/android-back-guard.js","utf8")});
 await p.waitForFunction(()=>window.MidanBackGuard?.installed(),{timeout:8000});
 let startingURL=p.url();
 let n=await p.evaluate(()=>history.length);
 if(n<2)throw Error("No synthetic back history");
 await p.goBack({waitUntil:"domcontentloaded",timeout:10000}).catch(()=>null);
 await p.waitForTimeout(300);
 if(p.url()!==startingURL||!await p.evaluate(()=>window.MidanBackGuard?.installed()))throw Error("Back exited homepage");
 console.log("PASS: native WebView back at home remains in app, history "+n);
 const nav=p.locator('[data-view="settings"]').first();await nav.click();await p.waitForTimeout(150);
 await p.goBack({waitUntil:"domcontentloaded",timeout:10000}).catch(()=>null);
 await p.waitForTimeout(350);
 const view=await p.evaluate(()=>document.querySelector(".bottom-link.active[data-view],.nav-btn.active[data-view]")?.dataset.view);
 if(view!=="home")throw Error("Back did not return to home from settings: "+view);
 console.log("PASS: back from settings returns home without exit");
 // Native WebView back from a media lightbox should close media instead of whole page.
 await p.evaluate(()=>{const e=document.createElement("div");e.className="midan-media-viewer";document.body.append(e);window.MidanMediaViewer={close:()=>e.hidden=true}});
 await p.goBack({waitUntil:"domcontentloaded",timeout:10000}).catch(()=>null);
 await p.waitForTimeout(250);
 if(!await p.evaluate(()=>document.querySelector(".midan-media-viewer").hidden))throw Error("Back did not close media");
 console.log("PASS: back dismisses media overlay");
 if(errors.length)throw Error("Page errors: "+errors.join(";"));
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
