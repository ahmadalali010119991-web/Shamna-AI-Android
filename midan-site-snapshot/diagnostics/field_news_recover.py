"""Public-source news-only field feed: full text, media metadata, ten-hour replay.
Data are source-attributed reports, not independently verified statements.
No tokens, authentication, or private Telegram APIs.
"""
import datetime as dt, html, json, re, sys, urllib.parse, urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path("midan-site-snapshot/data")
ROOT.mkdir(parents=True,exist_ok=True)
OUT=ROOT/"field-news-10h.json"
AUDIT=ROOT/"field-news-audit.json"
CUTOFF=dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=10)
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
SRC=[{"handle":"suhebb0","name":"صهيب اليعربي","outlet":"قناة صهيب اليعربي"}]
NEWS_RE=re.compile(r"(?:إصابة|اصابة|وفاة|توفّي|توفي|قتل|قتيل|مقتل|إطلاق نار|قصف|اشتباك|انفجار|حريق|اعتقال|اعتقلت|أوقفت|سجلت|أعلن|أعلنت|أفادت|أكدت|صدرت|وزارة|مشفى|مستشفى|مظاهرة|احتجاج|تصريح|إغلاق|افتتاح|زيارة|اجتماع|انتشار|عثر|تشكيل لجنة|تحقيق|بيان|حملة|الحكومة|اشتباكات|تعرض|انهيار|توقيف|تفجير|ضربة|عاجل|الأسعار|سوريا|خدمات|الجيش|المحافظة|مناشد|استهداف|عقوبات|نزوح)",re.I)
OPINION_RE=re.compile(r"(?:^|\s)(?:برأيي|في رأيي|أعتقد|أظن|تصوري|وجهة نظري|نصيحتي|لا تنس|لا تنسوا|افعل|افعلوا|تأمل|تذكر|تذكّر|اللهم|صباح الخير|مساء الخير|جمعة مباركة|مساء النور|دعاء|مقتطف|هذا رأيي)(?:\s|$)|(?:لا تمش|لا تيأس|ما تراه صواب|كن قويا|كن قويًا)",re.I)
HARM_RE=re.compile(r"(?:اشتر|خصم|عرض خاص|تابعونا الآن|إعلان تجاري|اشترك معنا)",re.I)
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"text/html"})
 with urllib.request.urlopen(req,timeout=25) as f:return f.read().decode("utf-8","replace")
def text_content(node):
 if not node:return ""
 node=BeautifulSoup(str(node),"html.parser")
 for a in node.find_all(["br","p"]):
  if a.name=="br":a.replace_with("\n")
  elif a.name=="p":a.insert_before("\n")
 t=node.get_text(" ",strip=False)
 t=re.sub(r" *\n *","\n",t)
 t=re.sub(r"[ \t]+"," ",t)
 t=re.sub(r"\n{3,}","\n\n",t)
 return t.strip()
def classify(t):
 if len(t.strip())<32:return "exclude","very_short"
 if OPINION_RE.search(t):return "exclude","opinion_or_advice"
 if HARM_RE.search(t) and not NEWS_RE.search(t):return "exclude","promotion"
 if NEWS_RE.search(t):return "news","factual_report"
 if re.search(r"#[\u0600-\u06ff]+\s+\S+",t) and len(t)>105 and re.search(r"(?:حدث|وقع|يتحدث|توجه|خرج|وصل|بدأ|استمر)",t):return "news","event_report"
 return "exclude","insufficient_news_evidence"
def media(card):
 video=card.select_one("video, .tgme_widget_message_video_player, .tgme_widget_message_roundvideo_player")
 videoUrl=None
 if video:
  for node in [video]+list(video.select("video,source")):
   for k in ("src","data-video","data-src","data-url"):
    val=node.get(k,"")
    if val.startswith("https://") and re.search(r"(?:\.mp4|\.webm|telesco\.pe)",val,re.I):videoUrl=val;break
   if videoUrl:break
 picture=card.select_one(".tgme_widget_message_photo_wrap, .tgme_widget_message_video_thumb, .tgme_widget_message_video_player, .tgme_widget_message_photo")
 image=None
 if picture:
  style=picture.get("style","")
  m=re.search(r"background-image\s*:\s*url\(['\"]?(.+?)['\"]?\)",style,re.I)
  if m:image=html.unescape(m.group(1))
  if not image:
   i=picture.select_one("img[src]") or card.select_one("img[src]")
   if i:image=html.unescape(i.get("src",""))
 return bool(video),videoUrl,image
def extract(source,page):
 soup=BeautifulSoup(page,"html.parser")
 out=[]
 for el in soup.select(".tgme_widget_message[data-post]"):
  code=el.get("data-post","")
  if not code.startswith(source["handle"]+"/"):continue
  num=code.split("/")[-1]
  if not num.isdigit():continue
  time=el.select_one("time[datetime]")
  if not time:continue
  try:date=dt.datetime.fromisoformat(time["datetime"].replace("Z","+00:00"))
  except:continue
  if date.tzinfo is None:date=date.replace(tzinfo=dt.timezone.utc)
  if date<CUTOFF:continue
  body=text_content(el.select_one(".tgme_widget_message_text"))
  if not body:continue
  decision,reason=classify(body)
  video,videoUrl,picture=media(el)
  url="https://t.me/"+source["handle"]+"/"+num
  item={"id":"voice-"+source["handle"]+"-"+num,"sourceId":source["handle"],"author":source["name"],"source":source["outlet"],"title":re.sub(r"\s+"," ",body)[:165],"fullText":body,"summary":body,"publishedAt":date.astimezone(dt.timezone.utc).isoformat().replace("+00:00","Z"),"url":url,"country":"سوريا","kind":"news","verification":"source_report","editorialTier":"source_attributed","video":video,"videoUrl":videoUrl,"imageUrl":picture}
  out.append((item,decision,reason))
 return out
def run():
 allitems={};discard={};pages=0
 for source in SRC:
  before=None
  for i in range(8):
   url="https://t.me/s/"+source["handle"]+("?before="+str(before) if before else "")
   page=fetch(url);pages+=1
   ids=[int(x) for x in re.findall(r'data-post="'+re.escape(source["handle"])+r'/(\d+)"',page)]
   if not ids:break
   batch=extract(source,page)
   for item,decision,reason in batch:
    if decision=="news":allitems[item["id"]]=item
    else:discard[item["id"]]={"url":item["url"],"reason":reason}
   nextBefore=min(ids)
   if not batch or (before is not None and nextBefore>=before):break
   before=nextBefore
 # Preserve still-valid previously observed reports if Telegram paginated away.
 if OUT.exists():
  try:
   old=json.loads(OUT.read_text())
   for item in old.get("items",[]):
    stamp=dt.datetime.fromisoformat(item["publishedAt"].replace("Z","+00:00"))
    if stamp>=CUTOFF and item["id"] not in allitems:allitems[item["id"]]=item
  except Exception:pass
 rows=sorted(allitems.values(),key=lambda x:x["publishedAt"],reverse=True)
 payload={"schema":2,"windowHours":10,"publisher":"Midan Al Khabar","sources":[s["handle"] for s in SRC],"items":rows}
 audit={"pagesScanned":pages,"approved":len(rows),"rejected":len(discard),"reasons":{k:sum(v["reason"]==k for v in discard.values()) for k in sorted({v["reason"] for v in discard.values()})},"excludedUrls":list(discard.values())[:30]}
 old=OUT.read_text() if OUT.exists() else None
 new=json.dumps(payload,ensure_ascii=False,indent=2)+"\n"
 if old!=new:OUT.write_text(new)
 AUDIT.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({"scanned":pages,"news":len(rows),"excluded":len(discard),"sample":[{"id":x["id"],"chars":len(x["fullText"]),"video":x["video"],"videoUrl":bool(x["videoUrl"]),"imageUrl":bool(x["imageUrl"])} for x in rows[:8]]},ensure_ascii=False))
if __name__=="__main__":run()
