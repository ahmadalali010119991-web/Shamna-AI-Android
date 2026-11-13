const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..');
const feature=fs.readFileSync(path.join(base,'feature/news-card-studio.js'),'utf8');
const logos=path.resolve(base,'source-logos');
async function test(){
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:430,height:900},acceptDownloads:true,userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 MidanAlKhabarApp/1.3.9'});
 const page=await ctx.newPage();page.on('pageerror',e=>console.error('PAGE_ERROR:',e.message));
 await page.route('**/news-card-studio.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:feature}));
 await page.route('**/source-logos/*.png',r=>{
   const name=r.request().url().split('/').pop();
   if(!['sana.png','suhaib.png','aljazeera.png'].includes(name))return r.abort();
   return r.fulfill({status:200,contentType:'image/png',body:fs.readFileSync(path.join(logos,name))});
 });
 await page.goto('https://midan-al-khabar.vercel.app/',{waitUntil:'domcontentloaded',timeout:50000});
 await page.waitForFunction(()=>!!window.MidanNewsCardStudio,{timeout:15000});
 const cases=[
  {name:'sana-photo',source:'سانا',title:'سوريا تشارك في نداء دولي لإدخال المساعدات وتوفير الرعاية الصحية في غزة',summary:'تطورات إنسانية ودعوات دولية لدعم المدنيين وتوفير الرعاية الصحية العاجلة.',photo:true,logo:'sana'},
  {name:'suhaib-text',source:'صهيب اليعربي',title:'تطورات جديدة في الميدان السوري وخبر تفصيلي من المصدر الأصلي',summary:'تفاصيل الحدث كما نشرها المصدر، مع الحفاظ على الدقة وعدم تغيير المعنى.',photo:false,logo:'suhaib'},
  {name:'aljazeera-photo',source:'الجزيرة',title:'تطورات إقليمية مهمة وتغطية مباشرة للأحداث في المنطقة',summary:'هذا خبر تجريبي لاختبار التصميم وظهور هوية المصدر بشكل صحيح.',photo:true,logo:'aljazeera'}
 ];
 fs.mkdirSync(path.join(__dirname,'previews'),{recursive:true});
 for(const c of cases){
  const info=await page.evaluate(async c=>{
   const pic=(()=>{
    if(!c.photo)return '';
    const e=document.createElement('canvas');e.width=1100;e.height=660;const g=e.getContext('2d');
    const grad=g.createLinearGradient(0,0,1100,660);grad.addColorStop(0,'#294f7a');grad.addColorStop(1,'#7796ab');
    g.fillStyle=grad;g.fillRect(0,0,1100,660);
    for(let i=0;i<8;i++){g.fillStyle=i%2?'#e3dfce':'#aac2d0';g.fillRect(i*150,25,66,210)}
    for(let i=0;i<11;i++){g.fillStyle='#131c33';g.beginPath();g.arc(i*112+48,320+(i%3)*20,42,0,6.29);g.fill();g.fillRect(i*112+6,365,88,240)}
    g.fillStyle='#6c4e35';g.fillRect(395,345,320,280);
    return e.toDataURL('image/png');
   })();
   const item={title:c.title,summary:c.summary,source:c.source,photo:pic,date:'2026-11-13T08:20:00Z',category:'أخبار'};
   const rendered=await window.MidanNewsCardStudio.render(item,'portrait');
   return {identity:rendered.sourceLogo,warning:rendered.warning,png:rendered.canvas.toDataURL('image/png')};
  },c);
  if(info.identity!==c.logo)throw Error(c.name+': wrong mapped source '+info.identity);
  if(info.warning)throw Error(c.name+': '+info.warning);
  const buffer=Buffer.from(info.png.split(',')[1],'base64');
  if(buffer.length<30000)throw Error(c.name+' PNG suspiciously small');
  fs.writeFileSync(path.join(__dirname,'previews',c.name+'.png'),buffer);
  console.log('PASS',c.name,info.identity,buffer.length);
 }
 const view=page.locator('#newsList');
 await page.evaluate(()=>{const x=document.querySelector('#newsList');x.innerHTML='<article class="news-card" data-article="cardtest"><div class="card-meta">سوريا</div><h3>عنوان عربي تجريبي للتأكد من زر الصورة</h3><p class="card-desc">خبر تجريبي</p><span class="source-name">سانا</span></article>'});
 await view.locator('.mcs-create').waitFor({timeout:10000});
 if(await view.locator('.mcs-create').count()!==1)throw Error('button duplicated');
 await view.locator('.mcs-create').click();
 await page.locator('#mcs-preview[src^="data:image/png"]').waitFor({timeout:12000});
 const [d]=await Promise.all([page.waitForEvent('download',{timeout:25000}),page.locator('#mcs-save').click()]);
 if(!d.suggestedFilename().endsWith('.png'))throw Error('PNG download failed');
 console.log('PASS button, modal and browser download');
 await page.close();
}finally{await browser.close()}}
test().catch(e=>{console.error(e);process.exit(1)});
