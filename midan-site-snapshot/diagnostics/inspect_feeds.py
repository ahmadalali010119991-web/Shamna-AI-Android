import json,urllib.request,datetime,re
from pathlib import Path
base='https://midan-al-khabar.vercel.app'
root=Path('midan-site-snapshot/diagnostics');root.mkdir(parents=True,exist_ok=True)
headers={'User-Agent':'MidanAlKhabarApp/1.3.10 Mozilla/5.0','Accept':'application/json'}
for tag,path in [('voices','/api/citizen?voices=public'),('news','/api/news'),('sports','/api/news?section=sports')]:
 try:
  req=urllib.request.Request(base+path,headers=headers)
  with urllib.request.urlopen(req,timeout=32) as x: d=json.load(x)
  rows=d.get('items',d.get('articles',[])) if isinstance(d,dict) else d
  if not isinstance(rows,list):rows=[]
  cutoff=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=10)
  recent=[]
  for v in rows:
   if not isinstance(v,dict):continue
   stamp=v.get('publishedAt',v.get('date',''))
   try:dt=datetime.datetime.fromisoformat(str(stamp).replace('Z','+00:00'))
   except:continue
   if dt.tzinfo and dt>=cutoff:recent.append(v)
  fields={}
  for v in rows[:25]:
   if isinstance(v,dict):
    for k in v:fields[k]=fields.get(k,0)+1
  media_fields={k:sum(bool(v.get(k)) for v in rows if isinstance(v,dict)) for k in fields if re.search(r'image|video|photo|media|original|content|summary|body',k,re.I)}
  sample=[{'id':v.get('id'),'source':v.get('source'),'author':v.get('author'),'date':v.get('publishedAt'),'title_length':len(v.get('title') or ''),'summary_length':len(v.get('summary') or ''),'keys':list(v)} for v in recent[:4]]
  print(tag, json.dumps({'total':len(rows),'recent_10h':len(recent),'fields':fields,'media_fields':media_fields,'recent_structure':sample},ensure_ascii=False)[:4500])
 except Exception as e: print(tag,'ERROR',str(e)[:300])
