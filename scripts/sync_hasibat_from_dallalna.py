#!/usr/bin/env python3
"""Sync the signed Hasibat Android APK hosted on Dallalna into its public update manifest.

Does not change app code and cannot advertise an unverified or older APK.
Reads Dallalna's *public* app_downloads listing as a guest.
"""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

APP_PACKAGE="com.syrianlira.calculator"
CERT_SHA256="ae4461cd1629197505fea7bc540c5c63bac447a40dd66fb57433962f1d8946b5"
REPO_FILE=pathlib.Path("hasibat-update.json")
HOME_PAGE="https://dallalna.com/install"
SUPABASE_HOST="ftzmeimurgsqzvmcahhs.supabase.co"
APP_NAME="حاسبة الليرة"

def get(url, headers=None, maximum=9_000_000):
    req=urllib.request.Request(url,headers={"User-Agent":"Hasibat-Release-Monitor/1.0",**(headers or {})})
    with urllib.request.urlopen(req,timeout=35) as resp:
        if resp.status!=200:raise RuntimeError(f"HTTP {resp.status}")
        result=resp.read(maximum+1)
        if len(result)>maximum:raise RuntimeError("Document too large")
        return result

def discover_link():
    html=get(HOME_PAGE).decode("utf-8","replace")
    match=re.search(r'<script[^>]*\bsrc="(/assets/index-[a-zA-Z0-9_-]+\.js)"',html)
    if not match:raise RuntimeError("Cannot find public site bundle")
    js=get("https://dallalna.com"+match.group(1),maximum=7_000_000).decode("utf-8","replace")
    m=re.search(r'const\s+\w+="(https://'+re.escape(SUPABASE_HOST)+r')",\w+="(eyJ[^"]+)"',js)
    if not m:raise RuntimeError("Cannot discover the public read-only site client")
    base,key=m.group(1),m.group(2)
    endpoint=(base+"/rest/v1/app_downloads?select=name,file_url,version"
             +"&name=eq."+urllib.parse.quote(APP_NAME,safe=""))
    rows=json.loads(get(endpoint,headers={"apikey":key,"Authorization":"Bearer "+key},maximum=200_000))
    matches=[r for r in rows if r.get("name")==APP_NAME]
    if len(matches)!=1:raise RuntimeError("No unique Hasibat entry on Dallalna")
    url=matches[0].get("file_url") or ""
    parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!="https" or parsed.hostname!=SUPABASE_HOST or not parsed.path.startswith(
        "/storage/v1/object/public/site-assets/") or not parsed.path.endswith(".apk") or parsed.query or parsed.fragment:
        raise RuntimeError("Hasibat APK URL not a trusted public Dallalna asset")
    return url

def download_apk(url,path):
    digest=hashlib.sha256()
    size=0
    request=urllib.request.Request(url,headers={"User-Agent":"Hasibat-Release-Monitor/1.0"})
    with urllib.request.urlopen(request,timeout=60) as response, path.open("wb") as out:
        if response.status!=200:raise RuntimeError("APK URL not available")
        for chunk in iter(lambda:response.read(131072),b""):
            size+=len(chunk)
            if size>100_000_000:raise RuntimeError("APK is too large")
            digest.update(chunk);out.write(chunk)
    if size<200_000 or path.open("rb").read(4)!=b"PK\x03\x04":
        raise RuntimeError("Downloaded file is not an APK")
    return digest.hexdigest(),size

def tool_path(name):
    sdk=os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT") or "/opt/android-sdk"
    base=pathlib.Path(sdk)/"build-tools"
    available=sorted(base.glob("*/"+name),reverse=True) if base.exists() else []
    return str(available[0]) if available else name

def inspect_apk(path):
    def run(*args):
        return subprocess.check_output(args,stderr=subprocess.STDOUT,text=True,timeout=60)
    badging=run(tool_path("aapt"),"dump","badging",str(path))
    line=badging.splitlines()[0] if badging else ""
    match=re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",line)
    if not match or match.group(1)!=APP_PACKAGE:raise RuntimeError("APK has wrong package identity")
    code=int(match.group(2));version=match.group(3)
    if code<1 or code>1_000_000 or not re.fullmatch(r"[0-9A-Za-z._-]{1,24}",version):
        raise RuntimeError("Invalid APK release number")
    output=run(tool_path("apksigner"),"verify","--print-certs",str(path))
    cert=re.search(r"(?:Signer #1|V[234] Signer): certificate SHA-256 digest:\s*([0-9a-fA-F]+)",output)
    if not cert or cert.group(1).lower()!=CERT_SHA256:
        raise RuntimeError('APK signer did not match pinned Hasibat certificate')
    if "Signer #2" in output:raise RuntimeError("Unexpected APK signer")
    return code,version

def main():
    existing=json.loads(REPO_FILE.read_text(encoding="utf-8"))
    url=discover_link()
    # Dallalna publishes each APK at a new immutable, UUID-based storage URL.
    # Re-check the public listing automatically on every run, but do not
    # download the same 12 MB APK hundreds of times per day.
    if url == existing.get("apkUrl") and int(existing.get("versionCode", 0)) > 0:
        print("Dallalna APK unchanged; automatic monitoring is active. No full download needed.")
        return
    with tempfile.TemporaryDirectory() as directory:
        candidate=pathlib.Path(directory)/"candidate.apk"
        digest,size=download_apk(url,candidate)
        code,version=inspect_apk(candidate)
    previous=int(existing.get("versionCode",0))
    print(f"Dallalna signed APK: {version} (code {code}, bytes {size}); live notice code {previous}")
    if code<=previous:
        print("Already announced or published file is older. No change.")
        return
    manifest={
        "versionCode":code,
        "versionName":version,
        "required":False,
        "requiresUninstall":False,
        "url":HOME_PAGE,
        "apkUrl":url,
        "apkSha256":digest,
        "apkSize":size,
        "message":f"تحديث حاسبة الليرة السورية {version} جاهز. اضغط «تحميل التحديث» للتنزيل داخل التطبيق، ثم أكّد التثبيت فوق النسخة الحالية."
    }
    REPO_FILE.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Verified newer APK announced: version {version}, sha256 {digest}")

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print(f"Hasibat release sync stopped safely: {exc}",file=sys.stderr)
        raise
