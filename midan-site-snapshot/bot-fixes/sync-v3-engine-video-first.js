'use strict';
globalThis.__MIDAN_NEWS_RAW_FETCH=globalThis.fetch;
// Install final transport guard first; all wrappers run before it.
require('./source-links-final').install();
require('./telegram-routing').install();
require('./source-links').install();
require('./news-original-photo').install();
require('./trusted-voices').install();
require('./news-original-video').install();
// Video-first fallback for verified video posts: existing workflows remain unchanged on failure.
require('./voice-video-first').install();
module.exports=require('./sync-v3-engine-base');
