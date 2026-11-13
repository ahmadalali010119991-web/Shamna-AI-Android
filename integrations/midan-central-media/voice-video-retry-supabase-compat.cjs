'use strict';
/**
 * Exact source-compatible fix for Midan voice-video-first.js media retry queue.
 * When the connected Vercel Blob is unavailable or suspended, durably enqueue
 * the original message repair in the existing Supabase state-v3 queue.
 *
 * DO NOT deploy unless the exact production source anchors match once.
 * Retains all other retry, original message editing and source verification.
 */
const fs=require('node:fs'),Module=require('node:module');
const file=require.resolve('./voice-video-first-legacy.cjs');
let source=fs.readFileSync(file,'utf8');
function replaceOnce(from,to){
 if(source.split(from).length!==2)throw Error('MIDAN_RETRY_LEDGER_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS');
 source=source.replace(from,to);
}
const fallback=String.raw