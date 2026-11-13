import re, html, pathlib, urllib.request, urllib.parse, io, json
from PIL import Image
import cairosvg
root=pathlib.Path("midan-site-snapshot/source-logos");root.mkdir(parents=True,exist_ok=True)
heads={"User-Agent":"Mozilla/5.0 (compatible; MidanNewsCardLogoFetcher/1.0)"}
sources=[
("sana","https://sana.sy/"),
("aljazeera","https://www.aljazeera.net/"),
("suhaib","https://t.me/suhebb0"),
("bbc","https://www.bbc.com/"),
]
def fetch(url):
 req=urllib.request.Request(url,headers=heads)
 with urllib.request.urlopen(req,timeout=22) as f:return f.read(),f.geturl(),f.headers.get("Content-Type","")
def get_meta(page,key):
 for m in re.finditer(r"<meta\s+[^>]*>",page,re.I):
  tag=m.group()
  if re.search(r"""(?:property|name)=['"]"""+re.escape(key)+r"""['"]""",tag,re.I):
   z=re.search(r"""content=['"]([^'"]+)['"]""",tag,re.I)
   if z:return html.unescape(z.group(1))
def get_icon(page):
 for m in re.finditer(r"<link\s+[^>]*>",page,re.I):
  tag=m.group()
  if re.search(r"""rel=['"][^'"]*(?:icon)[^'"]*['"]""",tag,re.I):
   z=re.search(r"""href=['"]([^'"]+)['"]""",tag,re.I)
   if z:return html.unescape(z.group(1))
for key,site in sources:
 try:
  raw,final,ct=fetch(site);page=raw.decode("utf-8","replace")
  options=[get_meta(page,"og:image")]
  if key=="sana":options=["https://cdn.sananews.sy/2026/08/logo-footer.svg",get_icon(page)]
  if key=="aljazeera":options=["https://www.aljazeera.net/favicon.ico",get_icon(page)]
  if key=="bbc":options=["https://www.bbc.com/favicon.ico",get_icon(page)]
  for u in filter(None,options):
   if u.startswith("//"):u="https:"+u
   u=urllib.parse.urljoin(final,u)
   try:
    b,url,ctype=fetch(u)
    if b[:100].lstrip().startswith(b"<svg") or u.lower().split("?")[0].endswith(".svg"):
     b=cairosvg.svg2png(bytestring=b,output_width=400)
    im=Image.open(io.BytesIO(b));im.load()
    if im.width < 20 or im.height < 20:continue
    im.thumbnail((320,320))
    outfile=root/(key+".png");im.convert("RGBA").save(outfile,optimize=True)
    print(json.dumps({"key":key,"url":url,"width":im.width,"height":im.height,"bytes":outfile.stat().st_size},ensure_ascii=False));break
   except Exception as e:print("candidate rejected",key,u,str(e)[:120])
  else:print("NO_IMAGE",key)
 except Exception as e:print("SOURCE_ERROR",key,str(e)[:180])
