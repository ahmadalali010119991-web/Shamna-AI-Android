'use strict';
/** Midan sports articles must not leak into the Syrian/general feed. */
const sportsCategories=new Set(['sports','sport','رياضة','الرياضة','رياضي','رياضية']);
const sportsPattern=/(?:كرة\s*(?:القدم|السلة|الطائرة|اليد)|مباراة|مباريات|الدوري\s+(?:السوري|الإنجليزي|الإسباني|الإيطالي|الألماني|الفرنسي|الأوروبي)|بطولة\s+(?:العالم|آسيا|أوروبا|أوراسيا|إفريقيا|الأندية|محلية|دولية)|كأس\s+(?:العالم|آسيا|أوروبا|الأمم|الأندية|السوبر)|الرياضة|الرياضية|الرياضيين|الرياضي|اللاعبين|لاعبي\s+|الووشو|الكونغ\s*فو|كونغ\s*فو|الأولمبياد\s+(?:الرياضي|الصيفي|الشتوي)|الميدالية\s+(?:الذهبية|الفضية|البرونزية)|سباق\s+(?:السيارات|الدراجات|الجري)|التنس|الملاكمة|السباحة|الألعاب\s+الأولمبية)/u;
const explicit=(a)=>[a.category,a.editorialSection,a.section,a.topic].some(v=>sportsCategories.has(String(v||'').toLowerCase().trim()));
function isSports(a){
  if(!a||typeof a!=='object')return false;
  if(explicit(a))return true;
  // Do not infer from the body: a military/political report mentioning a player remains general.
  const title=String(a.title||'').normalize('NFKC');
  return sportsPattern.test(title);
}
function selectSports(raw,requested){
 const list=Array.isArray(raw)?raw:[];
 const sports=String(requested||'').toLowerCase()==='sports';
 return list.filter(a=>isSports(a)===sports).map(a=>isSports(a)?{...a,category:'sports',editorialSection:'sports'}:a);
}
module.exports={isSports,selectSports};
