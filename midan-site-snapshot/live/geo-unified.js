/* Additive editorial relevance layer — keep the existing newsfeed, translation,
   reader, notifications and independent Voices view unchanged. */
(function(){
'use strict';
if(typeof selectArticles!=='function'||typeof renderFeed!=='function'||typeof renderPills!=='function'||typeof articles==='undefined')return;
const GEO_COUNTRIES=[
['سوريا',/سوريا|سور(?:ي|ية|يين|يون)|دمشق|حلب|إدلب|ادلب|الحسكة|القامشلي|دير\s*الزور|الميادين|الرقة|درعا|السويداء|القنيطرة|حمص|حماة|اللاذقية|طرطوس|السويعية|البوكمال|عين عيسى|syria|syrian|aleppo|idlib/i],
['فلسطين',/فلسطين|فلسطيني|غزة|غزي(?:ة|ون|ين|)|الضفة الغربية|القدس|رام الله|خان يونس|نابلس|gaza|palestine/i],
['لبنان',/لبنان|لبناني|بيروت|النبطية|البقاع|lebanon|beirut/i],
['العراق',/العراق|عراقي|بغداد|الموصل|البصرة|أربيل|كركوك|iraq|iraqi/i],
['الأردن',/الأردن|أردني|عمّان|jordan|amman/i],
['تركيا',/تركيا|تركي(?:ة|ين|ون|ا)|أنقرة|اسطنبول|إسطنبول|غازي عنتاب|ولاية وان|فان التركية|van'ın|van’da|van'da|özalp|türkiye|turkey|turkish/i],
['إيران',/إيران|إيراني|طهران|iran|iranian/i],
['إسرائيل',/إسرائيل|إسرائيلي|تل أبيب|israel|israeli/i],
['السعودية',/السعودية|سعودي|الرياض|جدة|saudi/i],
['اليمن',/اليمن|يمني|تعز|صنعاء|عدن|الحديدة|مأرب|الحوثي|yemen|houthi/i],
['السودان',/السودان|سوداني|الخرطوم|دارفور|الفاشر|sudan/i],
['ألمانيا',/ألمانيا|ألماني|برلين|ميونخ|هامبورغ|germany|german/i],
['هولندا',/هولندا|هولندي|أمستردام|روتردام|netherlands|dutch/i],
['فرنسا',/فرنسا|فرنسي|باريس|france|french/i],
['بريطانيا',/بريطانيا|بريطاني|المملكة المتحدة|لندن|home office|british|britain|united kingdom|\bUK\b|\blabour mp\b|شبانة محمود|shabana mahmood/i],
['مصر',/مصر|مصري|القاهرة|الإسكندرية|egypt/i],
['بولندا',/بولندا|بولندي|البولندية|كراكوف|كراكف|poland|polish|krakow|kraków/i],
['بلغاريا',/بلغاريا|البلغارية|بلغاري|صوفيا|bulgaria|bulgarian/i],
['أوكرانيا',/أوكرانيا|أوكراني|زيلينسكي|ukraine|ukrainian|zelensky/i],
['روسيا',/روسيا|روسي|موسكو|بوتين|russia|russian|putin/i],
['نيوزيلندا',/نيوزيلندا|نيوزيلندي|أوكلاند|new zealand/i],
['باراغواي',/باراغواي|باراغوي|باراغوان|paraguay|paraguayan/i],
['الولايات المتحدة',/الولايات المتحدة|أمريكا|أميرك|أمريك|واشنطن|البيت الأبيض|نيويورك|ترامب|تكساس|texas|united states|washington|new york|trump/i],
['كندا',/كندا|كندي|أوتاوا|تورونتو|canada/i],
['إيطاليا',/إيطاليا|إيطالي|روما|italy/i],
['إسبانيا',/إسبانيا|إسباني|مدريد|spain/i],
['الصين',/الصين|صيني|بكين|china/i],
['اليابان',/اليابان|ياباني|طوكيو|japan/i],
['اليونان',/اليونان|يوناني|أثينا|greece|greek|athens/i],
['السويد',/السويد|سويدي|ستوكهولم|sweden|swedish|stockholm/i],
['البرازيل',/البرازيل|برازيلي|ساو باولو|ريو دي جانيرو|brazil|brazilian/i],
['الأرجنتين',/الأرجنتين|أرجنتيني|بوينس آيرس|argentina|argentinian/i],
['أفغانستان',/أفغانستان|أفغاني|كابول|afghanistan|afghan/i],
['باكستان',/باكستان|باكستاني|إسلام آباد|كراتشي|pakistan|pakistani/i],
['ميانمار',/ميانمار|بورما|بورمي|myanmar|burma|burmese/i],
['المكسيك',/المكسيك|مكسيكي|مكسيكو|mexico|mexican/i],
['الصومال',/الصومال|صومالي|مقديشو|somalia|somali/i],
['ليبيا',/ليبيا|ليبي|طرابلس الليبية|بنغازي|libya|libyan/i],
['تونس',/تونس|تونسي|tunisia|tunisian/i],
['قبرص',/قبرص|قبرصي|نيقوسيا|cyprus|cypriot/i]
];
const GEO_REGIONS=[
['القامشلي',/القامشلي|قامشلي|qamishli/i],
['دير الزور',/دير\s*الزور|الميادين|البوكمال|السويعية|deir ez|deir ezzor/i],
['الحسكة',/الحسكة|رأس العين|تل تمر|الشدادي|المالكية|hasakah/i],
['الرقة',/الرقة|عين عيسى|الطبقة السورية|raqqa/i],
['دمشق',/دمشق|damascus/i],
['ريف دمشق',/ريف دمشق|دوما|الغوطة الشرقية/i],
['حلب',/حلب|منبج|إعزاز|اعزاز|مدينة الباب|aleppo/i],
['إدلب',/إدلب|ادلب|سلقين|سرمدا|حارم|idlib/i],
['درعا',/درعا|بصرى الشام/i],
['السويداء',/السويداء|شهبا السورية/i],
['القنيطرة',/القنيطرة|الجولان السوري/i],
['حمص',/حمص|تدمر السورية/i],
['حماة',/حماة|محردة|السقيلبية/i],
['اللاذقية',/اللاذقية|جبلة السورية/i],
['طرطوس',/طرطوس|بانياس السورية/i]
];
for(const key of ['بولندا','بلغاريا','أوكرانيا','روسيا','نيوزيلندا','باراغواي','الولايات المتحدة','كندا','إيطاليا','إسبانيا','الصين','اليابان','السويد','اليونان','البرازيل','الأرجنتين','أفغانستان','باكستان','ميانمار','المكسيك','الصومال','ليبيا','تونس','قبرص']){
 if(!countries.some(x=>x[0]===key))countries.push([key,key]);
}

const EXACT_CITIES=[
 // These pairs are explicit to avoid inventing a city or a governorate.
 ['القامشلي','الحسكة','سوريا',/القامشلي|قامشلي|qamishli/i],
 ['الميادين','دير الزور','سوريا',/الميادين|mayadin/i],
 ['البوكمال','دير الزور','سوريا',/البوكمال|al bukamal/i],
 ['السويعية','دير الزور','سوريا',/السويعية/i],
 ['دير الزور','دير الزور','سوريا',/دير\s*الزور|deir ez|deir ezzor/i],
 ['مدينة الحسكة','الحسكة','سوريا',/مدينة الحسكة|مدينة الحسكة السورية/i],
 ['الرقة','الرقة','سوريا',/الرقة|raqqa/i],
 ['دمشق','دمشق','سوريا',/دمشق|damascus/i],
 ['حلب','حلب','سوريا',/حلب|aleppo/i],
 ['إدلب','إدلب','سوريا',/إدلب|ادلب|idlib/i],
 ['درعا','درعا','سوريا',/درعا/i],
 ['السويداء','السويداء','سوريا',/السويداء/i],
 ['حمص','حمص','سوريا',/حمص/i],
 ['حماة','حماة','سوريا',/حماة/i],
 ['طرطوس','طرطوس','سوريا',/طرطوس/i],
 ['اللاذقية','اللاذقية','سوريا',/اللاذقية/i],
 ['ستوكهولم','ستوكهولم','السويد',/ستوكهولم|stockholm/i],
 ['جزر الكناري','جزر الكناري','إسبانيا',/جزر الكناري|canary islands/i],
 ['تكساس','تكساس','الولايات المتحدة',/تكساس|texas/i],
 ['كراكوف','بولندا','بولندا',/كراكوف|كراكف|krakow|kraków/i],
 ['وارسو','بولندا','بولندا',/وارسو|warsaw/i],
 ['صوفيا','بلغاريا','بلغاريا',/صوفيا|sofia/i],
 ['كييف','أوكرانيا','أوكرانيا',/كييف|kyiv|kiev/i],
 ['خاركيف','أوكرانيا','أوكرانيا',/خاركيف|kharkiv/i],
 ['موسكو','روسيا','روسيا',/موسكو|moscow/i],
 ['برلين','ألمانيا','ألمانيا',/برلين|berlin/i],
 ['ميونخ','ألمانيا','ألمانيا',/ميونخ|munich/i],
 ['أمستردام','هولندا','هولندا',/أمستردام|amsterdam/i],
 ['روتردام','هولندا','هولندا',/روتردام|rotterdam/i],
 ['لاهاي','هولندا','هولندا',/لاهاي|the hague/i],
 ['لندن','بريطانيا','بريطانيا',/لندن|london/i],
 ['باريس','فرنسا','فرنسا',/باريس|paris/i],
 ['القاهرة','مصر','مصر',/القاهرة|cairo/i],
 ['إسطنبول','إسطنبول','تركيا',/اسطنبول|إسطنبول|istanbul/i],
 ['أنقرة','أنقرة','تركيا',/أنقرة|ankara/i],
 ['أوزالب','وان','تركيا',/أوزالب|Özalp|özalp/i],
 ['وان','وان','تركيا',/ولاية وان|مدينة وان|van(?:'ın|’ın|'da|’da| province)/i],
 ['تعز','تعز','اليمن',/تعز|taiz/i],
 ['عدن','عدن','اليمن',/عدن|aden/i],
 ['نيويورك','نيويورك','الولايات المتحدة',/نيويورك|new york/i],
 ['واشنطن','واشنطن','الولايات المتحدة',/واشنطن|washington/i],
 ['مدريد','مدريد','إسبانيا',/مدريد|madrid/i],
 ['روما','روما','إيطاليا',/روما|rome/i],
 ['بكين','بكين','الصين',/بكين|beijing/i],
 ['طوكيو','طوكيو','اليابان',/طوكيو|tokyo/i]
];
function explicitCities(text){return EXACT_CITIES.filter(x=>x[3].test(text))}

const mentions=(rows,text)=>rows.filter(x=>x[1].test(text)).map(x=>x[0]);
const voiceIds=new Set(),sourceState={items:[],at:0,loading:false};
function classify(article){
 if(!article||article.__geoClassified)return;
 article.__geoClassified=true;
 const headline=String(article.originalTitle||article.title||'');
 const summary=String(article.originalSummary||article.summary||'');
 const primary=mentions(GEO_COUNTRIES,headline),secondary=mentions(GEO_COUNTRIES,summary);
 const titleCities=explicitCities(headline),descriptionCities=explicitCities(summary);
 const city=titleCities[0]||(!primary.length?descriptionCities[0]:null);
 const areas=[...new Set([...mentions(GEO_REGIONS,headline),...mentions(GEO_REGIONS,summary)])];
 if(city){
  if(!areas.includes(city[1]))areas.unshift(city[1]);
  if(city[0]!==city[1]&&!areas.includes(city[0]))areas.push(city[0]);
 }
 const nearBorder=/حدود|الحدود|border|sınır|sınırında|معبر/i.test(headline+' '+summary);
 const tags=[...new Set([
   ...(primary.length?primary:secondary.length===1?secondary:[]),
   ...(nearBorder?secondary:[]),
   ...(city?[city[2]]:[]),
   ...(areas.length&&(!primary.length||primary.includes('سوريا'))?['سوريا']:[])
 ])];
 let location='الموقع غير محدد',quality='unknown';
 if(city){location=city[2];quality=titleCities.length?'high':'medium'}
 else if(primary.length===1){location=primary[0];quality='high'}
 else if(primary.length>1){
  // In a cross-border story, an identified target may establish the event location.
  if(primary.includes('أوكرانيا')&&primary.includes('روسيا')
   &&/على\s+أوكرانيا|هجمات.*أوكرانيا|هجوم.*أوكرانيا/i.test(headline)){
   location='أوكرانيا';quality='high';
  }else if(primary.includes('اليمن')&&/تعز|صنعاء|عدن|الحديدة|مأرب/i.test(headline)){
   location='اليمن';quality='high';
  }else if(primary.includes('لبنان')&&/قصف.*لبنان|بلدات جنوب لبنان|(?:في|جنوب)\s+لبنان/i.test(headline)){location='لبنان';quality='high'}
  else{location='أكثر من دولة';quality='multi'}
 }
 else if(secondary.length===1){location=secondary[0];quality='medium'}
 else if(secondary.length>1){location='أكثر من دولة';quality='multi'}
 else if(areas.length){location='سوريا';quality='medium'}
 // Publisher identity is not geographical evidence. An ungrounded location stays unknown.
 article.__relatedCountries=tags;
 article.__relatedRegions=areas;
 article.__geoQuality=quality;
 article.__geoCity=city?city[0]:null;
 article.__geoGovernorate=city?city[1]:(location==='سوريا'&&areas.length?areas[0]:null);
 article.country=location;
 article.province=city?(city[1]===city[0]?city[0]:city[1]+' • '+city[0]):(location==='سوريا'&&areas.length?areas[0]:null);
}
function mixSources(){
 if(!sourceState.items.length)return;
 const present=new Set(articles.map(x=>String(x.id)));
 for(const item of sourceState.items){
  if(!item||item.kind!=='post'||!item.id||!item.title||!item.author||!item.publishedAt)continue;
  const id='field-voice-'+item.id;
  if(present.has(id))continue;
  let url;try{url=new URL(item.url)}catch{continue}
  if(url.protocol!=='https:'||!Number.isFinite(Date.parse(item.publishedAt)))continue;
  const body=String(item.title)+' '+String(item.summary||'');
  const a={id,title:String(item.title),summary:String(item.summary||'').slice(0,500),
   url:url.href,publishedAt:item.publishedAt,source:item.author+' — '+(item.source||'مصدر أصلي'),
   sourceId:'field-voice',byline:item.author,language:'ar',verification:'source_report',
   editorialApproved:false,sourceReport:true,category:'سياسة',priority:'normal',
   importanceScore:53,isRefugee:/لاجئ|لجوء|مهاجر|نزوح|نازح|ترحيل|تهجير|refugee|asylum|migration/i.test(body),
   isWorldNews:false,country:'العالم',province:null};
  classify(a);articles.push(a);present.add(id);
 }
}
const originalSelect=selectArticles;
selectArticles=function(){
 mixSources();
 for(const a of articles)classify(a);
 const selectedCountry=prefs.country,selectedRegion=prefs.province;
 let list;
 try{
  prefs.country='all';prefs.province='all';
  list=originalSelect();
 }finally{prefs.country=selectedCountry;prefs.province=selectedRegion}
 list=list.filter(a=>(selectedCountry==='all'||(a.__relatedCountries||[]).includes(selectedCountry))&&
   (selectedRegion==='all'||(a.__relatedRegions||[]).includes(selectedRegion)));
 if(view!=='home'||query)return list;
 const standard=list.filter(a=>a.sourceId!=='field-voice'),field=list.filter(a=>a.sourceId==='field-voice'),out=[];
 let count=0;for(const a of standard){out.push(a);if(++count%4===0&&field.length)out.push(field.shift())}
 return out.concat(field).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||Number(b.importanceScore||0)-Number(a.importanceScore||0));
};
const originalPills=renderPills;
renderPills=function(){
 originalPills();
 const chooser=document.getElementById('provinceSelect');
 if(!chooser)return;
 const names=prefs.country==='all'||prefs.country==='سوريا'?provinces.slice():[];
 for(const a of articles){
  if(prefs.country!=='all'&&!(a.__relatedCountries||[]).includes(prefs.country))continue;
  for(const region of a.__relatedRegions||[])if(!names.includes(region))names.push(region);
 }
 chooser.innerHTML='<option value="all">كل المناطق</option>'+names.map(n=>'<option value="'+n+'">'+n+'</option>').join('');
 if(prefs.province!=='all'&&!names.includes(prefs.province)){prefs.province='all';savePrefs()}
 chooser.value=prefs.province;
};
const oldRender=renderFeed;
renderFeed=function(){
 mixSources();for(const a of articles)classify(a);
 return oldRender();
};
async function loadFieldSources(){
 if(sourceState.loading||Date.now()-sourceState.at<600000)return;
 sourceState.loading=true;
 try{
  const r=await fetch('/api/news?feature=voices',{cache:'no-store'});
  if(!r.ok)throw Error('Source feed unavailable');
  const d=await r.json();
  if(!Array.isArray(d.items))throw Error('Invalid source feed');
  sourceState.items=d.items.filter(x=>x&&x.kind==='post'&&x.id&&x.author);
  sourceState.at=Date.now();
 }catch{sourceState.at=Date.now()-540000}
 finally{sourceState.loading=false;mixSources();renderFeed()}
}
renderFeed();
loadFieldSources().catch(()=>{});
})();

