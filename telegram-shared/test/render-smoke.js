'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),r=require('../hasibat-image');
(async()=>{
  const rates=await r.freshRates();
  console.log('Rate midpoints:',JSON.stringify({usd:rates.usd,eur:rates.eur,trY:rates.trY,ageSeconds:rates.ageSeconds}));
  for(const i of [0,20,37,39,52]){
    const s=r.makeSnapshot(rates,r.messages[i]);
    const png=await r.generatePng(s);
    if(png.width!==1080||png.height<1690||png.buffer.length<40000)throw Error('Unexpected image dimensions or size');
    fs.writeFileSync('/tmp/hasibat-preview-'+i+'.png',png.buffer);
    console.log('PNG_TEST',i,png.width,png.height,png.buffer.length,crypto.createHash('sha256').update(png.buffer).digest('hex').slice(0,16));
  }
  console.log('PNG_RENDER_PASS');
})().catch(e=>{console.error('PNG_RENDER_FAIL',e);process.exit(1)});
