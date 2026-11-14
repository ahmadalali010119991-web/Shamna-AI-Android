'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'production-news-original-video.cjs'),'utf8');
const moduleStub={exports:{}};
vm.runInNewContext(src,{module:moduleStub,URL,Buffer,AbortSignal,Blob,FormData,
 setTimeout,clearTimeout,console,globalThis:{fetch:async()=>{throw Error('Not needed for parsing')}},
 require:p=>{
  if(p==='./news-original-photo')return {sourceLink:()=>null};
  throw Error('Unexpected require '+p);
 }},{filename:'production-news-original-video.cjs'});
const {videoCandidates}=moduleStub.exports;
const post='https://t.me/examplechannel/58';
const video='https://cdn4.telesco.pe/original.mp4?token=example';
const telegram='<div class="tgme_widget_message_video_player">'+
 '<i class="tgme_widget_message_video" data-video="'+video.replace(/&/g,'&amp;')+'"></i></div>';
assert.deepEqual(Array.from(videoCandidates(telegram,post)),[video],
 'Telegram widget data-video is discovered even when copyMessage fails');
const source='<video controls><source src="https://videos.example.org/story.mp4"></video>';
assert.deepEqual(Array.from(videoCandidates(source,'https://www.bbc.com/news/story')),
 ['https://videos.example.org/story.mp4']);
const meta='<meta property="og:video:secure_url" content="https://cdn.example.org/report.mp4">';
assert.deepEqual(Array.from(videoCandidates(meta,'https://sana.sy/story')),
 ['https://cdn.example.org/report.mp4']);
assert.equal(videoCandidates('<i class="tgme_widget_message_video" data-video="http://localhost/x.mp4">',
 'https://t.me/examplechannel/58').length,0,'reject unsafe video URL');
assert.equal(videoCandidates(telegram,'https://untrusted.example.org/story').length,0,
 'Telegram-only markup must not be promoted on arbitrary news sites');
assert.equal(videoCandidates('<div class="tgme_widget_message_photo_wrap"></div>',post).length,0,
 'photo post must not fabricate video');
console.log('PASS: general source video parser: Telegram data-video, OG metadata, HTML video, and unsafe URL rejection');
