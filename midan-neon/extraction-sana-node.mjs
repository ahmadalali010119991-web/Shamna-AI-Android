import {parse} from './vendor/html5parser/parse.ts';
const MAX=1000000;
const clean=s=>String(s??'').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/\s+/gu,' ').trim();
const cleanParagraph=s=>clean(String(s??'').replace(/&(?:nbsp|#160|#xA0);/gi,' ').replace(/&(?:amp|quot|apos|lt|gt|#39|#34);/g,e=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&#39;':"'",'&#34;':'"'})[e]).replace(/[\u200e\u200f]/g,''));
function identity(raw){try{const u=new URL(raw);const m=u.pathname.match(/^\/([a-z0-9-]+(?:\/[a-z0-9-]+){0,3})\/(\d{6,9})\/?$/i);return u.protocol==='https:'&&['sana.sy','www.sana.sy'].includes(u.hostname)&&!u.username&&!u.password&&!u.port&&m?{id:m[2],key:'sana:'+m[2],category:m[1].split('/')[0].toLowerCase()}:null}catch{return null}}
function media(raw,base){if(typeof raw!=="string"||!raw.trim())return null;try{const u=new URL(raw,base);return u.protocol==='https:'&&['sana.sy','cdn.sananews.sy','www.sana.sy'].includes(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null}catch{return null}}
async function readPage(r){if(!r.ok)throw Error('http_'+r.status);if(!/text\/html/i.test(r.headers.get('content-type')||''))throw Error('not_html');const rd=r.body?.getReader();if(!rd)throw Error('empty');let n=0;const chunks=[];try{while(true){const{done,value}=await rd.read();if(done)break;n+=value.length;if(n>MAX){await rd.cancel();throw Error('too_large')}chunks.push(value)}}finally{rd.releaseLock()}const bytes=new Uint8Array(n);let off=0;for(const v of chunks){bytes.set(v,off);off+=v.length}return new Response(bytes,{headers:{'content-type':'text/html; charset=utf-8'}})}

function attr(n,key){const a=n.attributes?.filter(x=>x.name.value.toLowerCase()===key)||[];if(a.length>1)throw Error('duplicate_attribute');const v=a[0]?.value?.value;if(v===undefined)return null;return v.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[\da-fA-F]{1,6});/g,t=>{const m={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(Object.hasOwn(m,t))return m[t];const i=t.startsWith('&#x')?parseInt(t.slice(3,-1),16):parseInt(t.slice(2,-1),10);return i>0&&i<=0x10ffff&&!(i>=0xd800&&i<=0xdfff)?String.fromCodePoint(i):t})}
function visit(nodes,cb){let count=0;const stack=[...nodes].reverse().map(n=>({n,parents:[]}));while(stack.length){const {n,parents}=stack.pop();if(++count>100000||parents.length>128)throw Error('ast_limit');cb(n,parents);if(n.type==='Tag'&&Array.isArray(n.body)){const p=[...parents,n];for(let i=n.body.length-1;i>=0;i--)stack.push({n:n.body[i],parents:p})}}}
function textOf(n){let out='';visit(n.body||[],(v,parents)=>{if(v.type==='Text'&&!parents.some(x=>['!--','script','style','template'].includes(x.name)))out+=v.value});return cleanParagraph(out)}
export async function extractSanaNode(row,fetcher=fetch){
 const ident=identity(row.source_url);if(row.source_id!=='sana'||!ident||ident.key!==row.source_key)throw Error('invalid_identity');
 const response=await fetcher(row.source_url,{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(10000)});
 const html=await (await readPage(response)).text(),tree=parse(html),meta={},articles=[];
 visit(tree,n=>{if(n.type!=='Tag')return;if(n.name==='meta'){const k=attr(n,'property');if(['og:title','og:url','og:type','og:image','article:published_time'].includes(k)&&!meta[k])meta[k]=attr(n,'content')}if(n.name==='article'&&attr(n,'id')==='post-'+ident.id)articles.push(n)});
 if(articles.length!==1||!articles[0].close)throw Error('article_shape');
 const entries=[];visit(articles[0].body||[],n=>{if(n.type==='Tag'&&(attr(n,'class')||'').split(/\s+/).includes('entry-content'))entries.push(n)});
 if(entries.length!==1||!entries[0].close)throw Error('entry_shape');
 const paragraphs=[],images=new Set(),videos=new Set();let video=false;
 const add=(set,raw)=>{const u=media(raw,row.source_url);if(u){set.add(u);if(set.size>30)throw Error('media_limit')}};
 visit(entries[0].body||[],(n,parents)=>{if(n.type!=='Tag'||parents.some(x=>['!--','script','style','template'].includes(x.name)))return;if(n.name==='p'){if(!n.close||parents.some(x=>x.name==='p'))throw Error('paragraph_shape');const t=textOf(n);if(t)paragraphs.push(t)}if(n.name==='img')add(images,attr(n,'data-src')||attr(n,'src'));if(n.name==='video'||n.name==='iframe'||(n.name==='source'&&parents.some(x=>x.name==='video'))){video=true;add(videos,attr(n,'src'))}});
 const canonical=identity(meta['og:url']),title=clean(meta['og:title']),at=Date.parse(meta['article:published_time']),expected=Date.parse(row.published_at);if(meta['og:type']!=='article'||canonical?.id!==ident.id||!title||title.length>600||!Number.isFinite(at)||!Number.isFinite(expected)||Math.abs(at-expected)>3600000||at>Date.now()+60000)throw Error('identity_or_timestamp_mismatch');
 add(images,meta['og:image']);const full=paragraphs.join('\n\n');if(full.length>45000||paragraphs.length>250)throw Error('text_limit');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(full))),x=>x.toString(16).padStart(2,'0')).join('');const requiresVideo=video||['video','videos'].includes(ident.category);const state=full.length<100||!paragraphs.length?'needs_text':requiresVideo||!images.size?'needs_media':'ready_for_review';
 return {state,title,at:new Date(at).toISOString(),paragraphs,hash,images:[...images],videos:[...videos],requiresVideo,category:ident.category};
}
