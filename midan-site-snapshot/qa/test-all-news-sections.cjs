const {chromium}=require('playwright');
const fs=require('fs');
const src=fs.readFileSync('midan-site-snapshot/feature/news-card-studio.js','utf8');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:420,height:900},userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 MidanAlKhabarApp/1.3.9'});
  const page=await ctx.newPage();
  await page.route('**/news-card-studio.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:src}));
  await page.goto('https://midan-al-khabar.vercel.app/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>!!window.MidanNewsCardStudio,{timeout:10000});
  await page.evaluate(()=>{
    const sports=document.createElement('section');sports.id='sportsView';
    sports.innerHTML='<article class="m-sports-card"><h3>فوز المنتخب السوري في مباراة ودية</h3><div class="m-sports-meta">وكالة رياضية عربية • 13 نوفمبر 2026</div><p>تغطية رياضية تجريبية مع نتائج المباراة</p><a class="m-sports-source" href="https://example.com/football">عرض المصدر الأصلي</a></article>';
    document.body.appendChild(sports);
    const voices=document.createElement('section');voices.id='voicesPanel';
    voices.innerHTML='<article class="news-card voice-post"><div class="card-meta">منشور من المصدر <time datetime="2026-11-13T10:00:00Z"></time></div><div class="voice-byline">✍️ صهيب اليعربي</div><h3>مستجدات الأوضاع في الميدان السوري</h3><p class="card-desc">موجز تجريبي من الميدان السوري</p><div class="card-foot"><span class="source-name">صهيب اليعربي</span><a href="https://t.me/suhebb0/100">المصدر الأصلي</a></div></article>';
    document.body.appendChild(voices);
    const main=document.querySelector('#newsList');
    main.innerHTML='<article class="news-card" data-article="mock"><h3>خبر من الموجز</h3><p>تجربة</p><div class="card-foot"><div class="card-actions"></div></div></article>';
  });
  for(const [selector,source,category] of [
   ['#sportsView .m-sports-card','وكالة رياضية عربية','الرياضة'],
   ['#voicesPanel .voice-post','صهيب اليعربي','الميدان السوري'],
   ['#newsList .news-card',undefined,undefined]
  ]){
   await page.locator(selector+' .mcs-create').waitFor({timeout:12000});
   await page.waitForTimeout(230);
   let count=await page.locator(selector+' .mcs-create').count();
   if(count!==1)throw Error('duplicate action '+selector+': '+count);
   await page.locator(selector+' .mcs-create').click();
   const preview=page.locator('#mcs-preview[src^="data:image/png"]');
   await preview.waitFor({timeout:16000});
   const png=await preview.evaluate(el=>el.src);
   if(!png.startsWith('data:image/png;base64,')||png.length<25000)throw Error('PNG generation failed '+selector);
   if(source){
    const stored=await page.evaluate(()=>window.MidanNewsCardStudio&&document.querySelector('#mcs-msg')?.textContent);
    console.log('PASS '+selector+' source='+source+' category='+category+' preview length='+png.length+' status='+stored);
   } else console.log('PASS '+selector);
   await page.locator('[data-mcs-close]').last().click();
  }
  const sports=await page.evaluate(()=>document.querySelector('#sportsView .m-sports-card').textContent);
  if(!sports.includes('المنتخب السوري'))throw Error('sports article changed');
  console.log('PASS all three feed types without changing source cards');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
