'use strict';
const previous=require('../lib/news-quality-base');
const {selectSports}=require('../lib/sports-news');
const sourceVideo=require('../lib/article-video');
const east=/الحسكة|دير الزور|الرقة|القامشلي|المالكية|رأس العين|تل تمر|الميادين|البوكمال|الشدادي/;
function score(a){const date=Date.parse(a.publishedAt||0);if(!Number.isFinite(date))return 0;const age=(Date.now()-date)/3600000;const fresh=age>=0&&age<=24;const official=a.isOfficialDecision===true&&age>=0&&age<=8?60*60*1000:0;const local=fresh&&east.test(String(a.province||'')+' '+String(a.title||''))?35*60*1000:0;return date+official+local}
module.exports=async(req,res)=>{
 if(req.query?.videoFor){req.query={...req.query,id:req.query.videoFor};return sourceVideo(req,res)}
 const original=res.json;
 res.json=function(data){
  if(Array.isArray(data?.articles)){
   const sportsOnly=String(req.query?.section||'').toLowerCase()==='sports';
   const articles=selectSports(data.articles,sportsOnly?'sports':'general');
   articles.sort(sportsOnly?(a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0):(a,b)=>Number(a.editorialTier||9)-Number(b.editorialTier||9)||score(b)-score(a));
   data={...data,articles,count:articles.length,currentFirst:true,sportsOnly};
  }
  return original.call(this,data);
 };
 return previous(req,res);
};
