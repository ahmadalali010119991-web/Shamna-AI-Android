'use strict';
/**
 * Node-only Vercel Blob binding. Works with a specifically authorized public
 * blob store. The existing PRIVATE Blob store must not be treated as public.
 * Client-visible media only after put + head receipts match.
 */
const {createVerifiedVideoStore}=require('./verified-video-store.cjs');
function createVercelBlobVideoStore({
 blob,token,allowedStorageHosts,storagePrefix='midan-media/videos'
}={}){
 if(!blob||typeof blob.put!=='function'||typeof blob.head!=='function')
  throw Error('VERCEL_BLOB_API_REQUIRED');
 if(typeof token!=='string'||token.length<16)throw Error('SERVER_ONLY_BLOB_TOKEN_REQUIRED');
 if(!Array.isArray(allowedStorageHosts)||!allowedStorageHosts.length)
  throw Error('APPROVED_PUBLIC_BLOB_HOST_REQUIRED');
 const pending=new Map();
 return createVerifiedVideoStore({
  storagePrefix,allowedStorageHosts,
  put:async(path,bytes,options)=>{
   const receipt=await blob.put(path,bytes,{...options,token});
   pending.set(path,receipt?.url);
   return receipt;
  },
  head:async path=>{
   const url=pending.get(path);
   if(!url)throw Error('STORAGE_RECEIPT_REQUIRED');
   // Read by the actual returned URL; do not guess the deployed blob domain.
   return blob.head(url,{token});
  }
 });
}
module.exports={createVercelBlobVideoStore};
