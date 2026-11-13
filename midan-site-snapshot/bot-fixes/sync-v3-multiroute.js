'use strict';
/** Keep all installed publisher protections in their original order.
 * The media retry worker runs alongside news sync, never changes the news result,
 * and sends no duplicate fresh post when upgrading a previous photo to video. */
globalThis.__MIDAN_NEWS_RAW_FETCH=globalThis.fetch;
require('./source-links-final').install();
require('./telegram-routing').install();
require('./source-links').install();
require('./news-original-photo').install();
require('./trusted-voices').install();
require('./news-original-video').install();
const videos=require('./voice-video-first');
videos.install();
const base=require('./sync-v3-engine-base');
module.exports={...base,async run(...args){
 const [news,media]=await Promise.allSettled([base.run(...args),videos.retryPending()]);
 if(media.status==='rejected')console.error('Midan video retry worker',String(media.reason?.message||media.reason).slice(0,170));
 else if(media.value?.failed)console.warn('Midan pending video updates',media.value);
 if(news.status==='rejected')throw news.reason;
 return news.value;
}};
