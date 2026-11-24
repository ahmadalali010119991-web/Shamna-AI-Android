import concurrent.futures, hashlib, json, pathlib, re, subprocess
from urllib.parse import quote
ROOT=pathlib.Path("recovered-frontend")
ROOT.mkdir(exist_ok=True)
base="https://midan-al-khabar.vercel.app/"
items=json.loads(pathlib.Path("expected-public-assets.json").read_text())
def restore(item):
    path=item["path"]; expected=item["sha1"]
    if not re.fullmatch(r"[A-Za-z0-9_.@/-]+",path) or ".." in pathlib.PurePosixPath(path).parts or not re.fullmatch(r"[0-9a-f]{40}",expected):
        return {"path":path,"state":"invalid_manifest"}
    dest=ROOT/path; dest.parent.mkdir(parents=True,exist_ok=True)
    for ua in ["MidanAlKhabar/1.3.10 Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36","Mozilla/5.0"]:
        try:
            res=subprocess.run(["curl","--fail","--silent","--show-error","--location","--max-redirs","2","--connect-timeout","8","--max-time","25","--max-filesize","5242880","--user-agent",ua,base+quote(path,safe="/")],capture_output=True,timeout=30)
            if res.returncode!=0: continue
            actual=hashlib.sha1(res.stdout).hexdigest()
            if actual==expected:
                dest.write_bytes(res.stdout)
                return {"path":path,"state":"exact","sha1":actual,"bytes":len(res.stdout)}
        except (OSError,subprocess.TimeoutExpired): pass
    return {"path":path,"state":"unavailable_or_mismatch","expected":expected}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(restore,items))
pathlib.Path("RECOVERY_RESULT.json").write_text(json.dumps(results,indent=2)+"\n")
print(f"Exact matches: {sum(x['state']=='exact' for x in results)}/{len(results)}")
