export const TABLES=Object.freeze([
  {
    "name": "source_candidates",
    "columns": [
      "source_key",
      "source_id",
      "source_url",
      "published_at",
      "first_seen",
      "last_seen",
      "state"
    ],
    "keys": [
      "source_key"
    ]
  },
  {
    "name": "candidate_enrichment",
    "columns": [
      "source_key",
      "state",
      "attempts",
      "claimed_at",
      "updated_at",
      "title",
      "source_published_at",
      "paragraph_count",
      "text_chars",
      "text_sha256",
      "images_json",
      "video_required",
      "category",
      "error"
    ],
    "keys": [
      "source_key"
    ]
  },
  {
    "name": "candidate_source_payloads",
    "columns": [
      "source_key",
      "paragraphs_json",
      "collected_at",
      "video_links_json"
    ],
    "keys": [
      "source_key"
    ]
  },
  {
    "name": "candidate_image_checks",
    "columns": [
      "source_key",
      "url",
      "state",
      "attempts",
      "updated_at",
      "mime",
      "width",
      "height",
      "http_status",
      "error"
    ],
    "keys": [
      "source_key",
      "url"
    ]
  },
  {
    "name": "candidate_publication_plans",
    "columns": [
      "source_key",
      "state",
      "text_sha256",
      "plan_sha256",
      "text_chars",
      "paragraphs",
      "photo_count",
      "required_video",
      "rich_blocks",
      "blockers_json",
      "updated_at"
    ],
    "keys": [
      "source_key"
    ]
  },
  {
    "name": "restored_source_registry",
    "columns": [
      "source_id",
      "source_name",
      "feed_url",
      "role",
      "enabled",
      "last_state",
      "last_checked_at",
      "last_http",
      "last_observed",
      "last_fresh",
      "last_inserted",
      "last_error"
    ],
    "keys": [
      "source_id"
    ]
  },
  {
    "name": "restored_source_items",
    "columns": [
      "source_key",
      "source_id",
      "source_url",
      "title",
      "published_at",
      "first_seen",
      "last_seen",
      "state"
    ],
    "keys": [
      "source_key"
    ]
  },
  {
    "name": "source_discovery_runs",
    "columns": [
      "run_key",
      "source_id",
      "state",
      "checked_at",
      "observed",
      "eligible",
      "known",
      "queued",
      "error"
    ],
    "keys": [
      "run_key"
    ]
  }
]);
const JSON_COLUMNS=new Set(['images_json','paragraphs_json','video_links_json','blockers_json']);
const DATES=new Set(['published_at','first_seen','last_seen','claimed_at','updated_at','source_published_at','collected_at','last_checked_at','checked_at']);
export function normalize(table,row){
 if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==table.columns.length)throw Error('invalid_row_shape');
 const result={};for(const c of table.columns){if(!Object.hasOwn(row,c))throw Error('missing_column:'+c);let v=row[c];if(v!==null&&JSON_COLUMNS.has(c)){if(typeof v==='string')v=JSON.parse(v);if(!Array.isArray(v))throw Error('invalid_array:'+c)}
 if(v!==null&&DATES.has(c)){if(typeof v!=='string')throw Error('invalid_date:'+c);let t=v;if(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(t))t=t.replace(' ','T')+'Z';if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(t)||!Number.isFinite(Date.parse(t)))throw Error('invalid_date:'+c);v=t}
 result[c]=v}
 if(table.keys.some(c=>typeof result[c]!=='string'||!result[c].length))throw Error('invalid_key');return result
}
export function pageQuery(table,cursor,limit=50){
 if(!TABLES.includes(table)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_page');
 if(cursor!==null&&(!Array.isArray(cursor)||cursor.length!==table.keys.length||cursor.some(v=>typeof v!=='string'||!v)))throw Error('invalid_cursor');
 const key=table.keys.join(',');const where=cursor===null?'':' WHERE '+(table.keys.length===1?key+'>?':'('+key+')>('+table.keys.map(()=>'?').join(',')+')');
 return {sql:'SELECT '+table.columns.join(',')+' FROM '+table.name+where+' ORDER BY '+key+' LIMIT ?',params:[...(cursor||[]),limit]};
}
export function partition(table,rows,maxBytes=900000){
 if(!Array.isArray(rows)||rows.length>100)throw Error('invalid_rows');
 const out=[];let batch=[];for(const row of rows){const value=normalize(table,row);const candidate=JSON.stringify([...batch,value]);if(new TextEncoder().encode(candidate).length>maxBytes){if(!batch.length)throw Error('single_row_exceeds_limit');out.push(batch);batch=[value];if(new TextEncoder().encode(JSON.stringify(batch)).length>maxBytes)throw Error('single_row_exceeds_limit')}else batch.push(value)}
 if(batch.length)out.push(batch);return out;
}
export async function transferTable(table,{query,importBatch,hash,checkpoint,runId,limit=50,apply=false}){
 if(!TABLES.includes(table)||!/^[-A-Za-z0-9_]{1,50}$/.test(runId))throw Error('invalid_run');
 let cursor=checkpoint?.cursor??null,rows=checkpoint?.rows??0,pages=checkpoint?.pages??0;
 for(;;){const raw=await query(pageQuery(table,cursor,limit));if(!Array.isArray(raw)||raw.length>limit)throw Error('invalid_source_page');if(!raw.length)return {cursor,rows,pages,complete:true};
 const groups=partition(table,raw);
 for(const group of groups){const payload=JSON.stringify(group),digest=await hash(payload);
 if(typeof digest!=='string'||!/^([0-9a-f]{64})$/.test(digest))throw Error('invalid_digest');
 const id=runId+':'+table.name+':'+digest;
 if(apply){const r=await importBatch({id,table:table.name,payload,expected:group.length,digest});if(Number(r?.matched_rows)!==group.length)throw Error('target_count_mismatch')}
 }
 const next=table.keys.map(k=>raw.at(-1)[k]);if(cursor&&JSON.stringify(cursor)===JSON.stringify(next))throw Error('cursor_not_advancing');
 cursor=next;rows+=raw.length;pages++;return {cursor,rows,pages,complete:raw.length<limit};
 }
}
