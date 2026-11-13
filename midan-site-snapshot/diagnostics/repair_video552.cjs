'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {backfill552}=require('../bot-fixes/voice-video-first.js');
const output=path.join(__dirname,'video552-repair-result.json');
(async()=>{
 if(fs.existsSync(output)){
  try{const a=JSON.parse(fs.readFileSync(output,'utf8'));if(a.updatedExistingMessage){console.log('ALREADY_COMPLETED');return}}catch{}
 }
 const result={attemptDate:new Date().toISOString(),targetMessageId:552,originalMessage:'https://t.me/suhebb0/47987'};
 if(!process.env.TELEGRAM_BOT_TOKEN){
  result.updatedExistingMessage=false;
  result.reason='Telegram bot token not configured as GitHub Actions secret';
 }else{
  try{Object.assign(result,await backfill552())}
  catch(e){result.updatedExistingMessage=false;result.reason=String(e.message||e).replace(process.env.TELEGRAM_BOT_TOKEN,'[REDACTED]').slice(0,260)}
 }
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(String(e));process.exitCode=1});
