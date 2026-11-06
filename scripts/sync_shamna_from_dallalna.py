#!/usr/bin/env python3
"""Automatically publish only verified newer Shamna APKs already hosted on Dallalna.

The script is fail-closed. It never uploads APKs or mutates the Dallalna site.
Do not remove its certificate check to work around a signing-key mismatch.
"""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request

PACKAGE = "com.shamna.ai"
# Signing identity observed on the original production-named Shamna APK archive.
# If the installed app uses a different signing identity, preserve that key instead.
EXPECTED_CERT_SHA256 = "16d9d351e4da9f6bfa175adbecd337a35ac6ff6b9b1bbec3291ec956fc431dcf"
SUPABASE_HOST = "ftzmeimurgsqzvmcahhs.supabase.co"
PUBLIC_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0em1laW11cmdzcXp2bWNhaGhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTg0NzMsImV4cCI6MjA5MTY5NDQ3M30.8kLjeKnDSlqcb0oqtVOmDKBImpyS8EN2PzJlbZxef8w"
MANIFEST = pathlib.Path("shamna-update.json")

def fetch(url, *, headers=None, max_bytes=300_000):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Shamna-Signed-Update-Monitor/1",
        **(headers or {}),
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status}")
        data = response.read(max_bytes+1)
    if len(data) > max_bytes:
        raise RuntimeError("Data too large")
    return data

def find_shamna_apk():
    url = (f"https://{SUPABASE_HOST}/rest/v1/app_downloads"
           "?select=name,file_url,version")
    rows = json.loads(fetch(url, headers={
        "apikey": PUBLIC_ANON_KEY,
        "Authorization": "Bearer " + PUBLIC_ANON_KEY,
    }))
    matches = [
        row for row in rows
        if isinstance(row.get("name"), str)
        and (re.search(r"shamna", row["name"], re.I) or "شامنا" in row["name"])
    ]
    if not matches:
        print("Shamna AI is not yet listed on Dallalna; nothing to announce.")
        return None
    if len(matches) != 1:
        raise RuntimeError("Ambiguous Shamna downloads in Dallalna listing")
    url = matches[0].get("file_url") or ""
    parsed = urllib.parse.urlsplit(url)
    if not (
        parsed.scheme == "https"
        and parsed.hostname == SUPABASE_HOST
        and parsed.path.startswith("/storage/v1/object/public/site-assets/")
        and parsed.path.endswith(".apk")
        and not parsed.query and not parsed.fragment
    ):
        raise RuntimeError("Shamna APK does not have a trusted direct Dallalna URL")
    return url

def android_tool(exe):
    sdk = pathlib.Path(os.getenv("ANDROID_HOME") or "/opt/android-sdk")
    candidates = sorted((sdk/"build-tools").glob("*/"+exe), reverse=True)
    return str(candidates[0]) if candidates else exe

def inspect(apk):
    badging = subprocess.check_output(
        [android_tool("aapt"), "dump", "badging", str(apk)],
        text=True, timeout=60)
    m = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not m or m.group(1) != PACKAGE:
        found = m.group(1) if m else "unreadable"
        raise RuntimeError(f"BLOCKED: Dallalna Shamna APK package is {found}; expected {PACKAGE}. Publish the official correctly signed application, not a QA build.")
    code, name = int(m.group(2)), m.group(3)
    if not (0 < code < 1_000_000) or not re.fullmatch(r"[\w.-]{1,24}", name):
        raise RuntimeError("Invalid Android release version")
    signature_output = subprocess.check_output(
        [android_tool("apksigner"), "verify", "--print-certs", str(apk)],
        text=True, stderr=subprocess.STDOUT, timeout=60)
    cert = re.search(r"Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]+)", signature_output)
    if not cert or cert.group(1).lower() != EXPECTED_CERT_SHA256 or "Signer #2" in signature_output:
        raise RuntimeError("BLOCKED: publisher signing certificate differs from the installed Shamna app")
    return code, name

def main():
    current = json.loads(MANIFEST.read_text("utf-8"))
    url = find_shamna_apk()
    if not url or url == current.get("apkUrl"):
        print("No changed Shamna APK URL; automatic monitoring continues.")
        return
    h = hashlib.sha256()
    with tempfile.TemporaryDirectory() as d:
        apk = pathlib.Path(d)/"shamna.apk"
        count = 0
        req = urllib.request.Request(url, headers={"User-Agent":"Shamna-Signed-Update-Monitor/1"})
        with urllib.request.urlopen(req, timeout=90) as src, apk.open("wb") as out:
            if src.status != 200: raise RuntimeError("APK fetch failed")
            while True:
                data = src.read(65536)
                if not data: break
                count += len(data)
                if count > 100_000_000: raise RuntimeError("APK too large")
                out.write(data); h.update(data)
        if count < 10000 or apk.open("rb").read(4) != b"PK\x03\x04":
            raise RuntimeError("Invalid Android APK file")
        code, name = inspect(apk)
    if code <= int(current.get("versionCode", 0)):
        print(f"Published Shamna APK {name} is not newer; nothing to announce.")
        return
    data = {
        "versionCode": code,
        "versionName": name,
        "required": False,
        "requiresUninstall": False,
        "apkUrl": url,
        "apkSha256": h.hexdigest(),
        "apkSize": count,
        "message": f"يتوفر الإصدار {name} من شامنا AI. يمكنك تنزيله وتثبيته فوق النسخة الحالية دون حذف بياناتك."
    }
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", "utf-8")
    print("Verified Shamna update:",name,"code",code,"sha256",data["apkSha256"])

if __name__ == "__main__":
    main()
