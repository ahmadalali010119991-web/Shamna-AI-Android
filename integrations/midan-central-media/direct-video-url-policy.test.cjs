'use strict';
const assert=require('node:assert/strict');
const {createDirectVideoUrlPolicy}=require('./direct-video-url-policy.cjs');
const stable=createDirectVideoUrlPolicy({allowedHosts:['interactive-examples.mdn.mozilla.net','cdn.example.org']});
(async()=>{
 assert.equal(await stable('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'),true);
 assert.equal(await stable('https://cdn.example.org/media/video.webm'),true);
 assert.equal(await stable('https://cdn.example.org/media/video.mp4?expires=1794570000'),false);
 assert.equal(await stable('https://cdn.example.org/media/video.mp4?X-Amz-Signature=secret'),false);
 assert.equal(await stable('https://cdn.example.org/media/video.mp4#clip'),false);
 assert.equal(await stable('https://another.example.org/a.mp4'),false);
 assert.equal(await stable('https://cdn.example.org/landing-page'),false);
 assert.equal(await stable('http://cdn.example.org/media/video.mp4'),false);
 assert.equal(await stable('https://cdn.example.org:8443/media/video.mp4'),false);
 assert.throws(()=>createDirectVideoUrlPolicy({allowedHosts:['*']}),/ALLOWED_HOSTS/);
 console.log('PASS: direct video URL allowlist, no ephemeral signatures, no untyped webpages');
})().catch(e=>{console.error(e);process.exitCode=1});
