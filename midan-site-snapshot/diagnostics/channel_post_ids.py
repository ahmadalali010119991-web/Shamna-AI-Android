import urllib.request,re,json,html
from bs4 import BeautifulSoup
channel='maydan_alkhabar'
before=None
for page in range(14):
  url='https://t.me/s/'+channel+('?before='+str(before) if before else '')
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Chrome/130 Safari/537.36'})
  try:
    with urllib.request.urlopen(req,timeout=25) as response: raw=response.read().decode('utf8','replace')
    doc=BeautifulSoup(raw,'html.parser')
    for a in doc.select('[data-post]'):
      code=a.get('data-post');txt=a.select_one('.tgme_widget_message_text')
      if not txt:continue
      body=txt.get_text(' ',strip=True)
      if any(w in body for w in ['محمد حجو','طفله','الإهمال الطبي','أصوات الميدان','وفاة الطفل','الطفل يحيى']):
        print(json.dumps({'post':code,'snippet':body[:350]},ensure_ascii=False))
    ids=[int(v) for v in re.findall('data-post="'+channel+'/([0-9]+)',raw)]
    if not ids:break
    print('PAGE',page,'range',min(ids),max(ids))
    before=min(ids)
  except Exception as e:print('ERROR',str(e));break
