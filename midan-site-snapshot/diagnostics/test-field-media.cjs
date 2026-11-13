const {chromium}=require("playwright"),fs=require("fs");
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync("/usr/bin/google-chrome")?{executablePath:"/usr/bin/google-chrome"}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:420,height:900},acceptDownloads:true,userAgent:"Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 MidanAlKhabarApp/1.3.9"});
  const page=await ctx.newPage();const errors=[];page.on("pageerror",x=>errors.push(x.message));
  await page.goto("https://midan-al-khabar.vercel.app/",{waitUntil:"domcontentloaded",timeout:55000});
  await page.waitForSelector("#newsList",{timeout:13000});
  const data=await page.evaluate(async()=>{const r=await fetch("https://raw.githubusercontent.com/ahmadalali010119991-web/Shamna-AI-Android/main/midan-site-snapshot/data/field-news-10h.json",{cache:"no-store"});if(!r.ok)throw Error("raw feed HTTP "+r.status);return r.json()});
  if(!data.items?.some(x=>x.id==="voice-suhebb0-47987"&&x.fullText?.includes("محاسبة")))throw Error("Original complete text not available");
  console.log("PASS: public recovered news feed, complete text and verified source URL; count="+data.items.length);
  await page.evaluate(()=>{
   let panel=document.querySelector("#voicesPanel");
   if(!panel){panel=document.createElement("section");panel.id="voicesPanel";document.body.append(panel)}
   panel.hidden=false;panel.style.display="block";
   panel.innerHTML='<h3 class="voices-latest-heading">منشورات الميدان السوري</h3><article class="news-card voice-post"><div class="card-meta"><time datetime="2026-11-12T21:41:21Z">الوقت</time></div><div class="voice-byline">✍️ صهيب اليعربي</div><h3>#الرقة</h3><p class="card-desc">ملخص مختصر</p><div class="card-foot"><span class="source-name">قناة صهيب اليعربي</span><a href="https://t.me/suhebb0/47987">اقرأ المصدر الأصلي</a></div></article><article class="news-card voice-post"><div class="card-meta"><time datetime="2026-11-12T21:55:00Z">الوقت</time></div><h3>نصيحة شخصية</h3><p class="card-desc">افعل ما تراه صوابا</p><div class="card-foot"><a href="https://t.me/suhebb0/47988">اقرأ المصدر الأصلي</a></div></article><h3 class="voices-latest-heading">الأرشيف</h3>';
  });
  await page.addScriptTag({content:fs.readFileSync("midan-site-snapshot/feature/media-click-fix.js","utf8")});
  await page.addScriptTag({content:fs.readFileSync("midan-site-snapshot/feature/field-feed-enhancer.js","utf8")});
  await page.waitForFunction(()=>document.querySelector('[data-midan-full-source="voice-suhebb0-47987"]')&&window.MidanFieldRecovery?.getItems().length>0,{timeout:23000});
  await page.waitForTimeout(900);
  const len=await page.locator('[data-midan-full-source="voice-suhebb0-47987"] .card-desc').evaluate(e=>e.textContent.length);
  if(len<280)throw Error("Original full text missing: "+len);
  if(await page.locator('a[href$="/47988"]').count())throw Error("Opinion remains in feed");
  const fresh=await page.locator('#voicesPanel [data-midan-full-source]').count();
  if(fresh<3)throw Error("Expected recovered news cards, got "+fresh);
  console.log("PASS: full text "+len+" chars, news restored "+fresh+", opinion excluded");
  await page.locator('[data-midan-full-source="voice-suhebb0-47987"] .midan-card-media-button').first().click({force:true});
  await page.locator('.midan-media-viewer:not([hidden])').waitFor({timeout:8000});
  const iframe=await page.locator(".midan-media-viewer iframe").getAttribute("src");
  if(!iframe||!iframe.includes("suhebb0/47987")||!iframe.includes("embed=1"))throw Error("Telegram video viewer not selected: "+iframe);
  console.log("PASS: media tap stays on Midan and opens Telegram embed player");
  await page.locator("[data-mid-close]").click({force:true});
  if(!page.url().startsWith("https://midan-al-khabar.vercel.app/"))throw Error("Media tap navigated outside the app");
  const source=fs.readFileSync("midan-site-snapshot/feature/source-images-no-redirect.js","utf8");
  if(source.includes("document.createElement('a')"))throw Error("Source media still creates an outbound anchor");
  if(!source.includes("document.createElement('button')"))throw Error("No media preview button created");
  if(errors.length)throw Error("JS errors: "+errors.join("; "));
  console.log("PASS: original-source links remain explicit; media opens internally; no JS errors");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
