import urllib.request,re,json,html
from bs4 import BeautifulSoup
for channel in ['maydan_alkhabar']:
  url='https://t.me/s/'+channel
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Chrome/130 Safari/537.36'})
  try:
    with urllib.request.urlopen(req,timeout=25) as r: raw=r.read().decode('utf8','replace')
    doc=BeautifulSoup(raw,'html.parser')
    for a in doc.select('[data-post]'):
      code=a.get('data-post');txt=a.select_one('.tgme_widget_message_text')
      if not txt:continue
      text=txt.get_text(' ',strip=True)
      if any(w in text for w in ['محمد حجو','طفله','الإهمال الطبي','أصوات الميدان','الرقة']):
        print(json.dumps({'post':code,'snippet':text[:280]},ensure_ascii=False))
    print('lastIds',re.findall('data-post="'+channel+'/([0-9]+)',raw)[-20:])
  except Exception as e:print('ERROR',str(e))
