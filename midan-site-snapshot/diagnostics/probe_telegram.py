import urllib.request,re,json,datetime
from html.parser import HTMLParser
urls=['https://t.me/s/suhebb0','https://t.me/s/suhebb0?before=47987']
for url in urls:
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36'})
  with urllib.request.urlopen(req,timeout=28) as r:text=r.read().decode('utf-8','replace')
  print(json.dumps({'url':url,'length':len(text),'posts':re.findall('data-post="([^"]+)"',text)[:30],'hasVideo':'tgme_widget_message_video' in text,'hasText':'tgme_widget_message_text' in text,'hasOpenGraph':'og:video' in text,'sample':text[text.find('tgme_widget_message_text')-100:text.find('tgme_widget_message_text')+900]},ensure_ascii=False)[:6000])
 except Exception as e:print(url,'ERROR',str(e)[:250])
