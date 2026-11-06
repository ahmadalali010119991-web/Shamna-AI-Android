#!/usr/bin/env python3
"""Add hourly 79-item heritage notifications to existing Shamna QA 1.6.
Preserve app package, UI, WebView and all preexisting APK contents.
Signing must use the *original* private QA key off GitHub.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib, os, re, subprocess

def run(*args):
    print("RUN",args[0],flush=True)
    subprocess.run(args,check=True)

base=Path("base-shamna.apk")
out=Path("Shamna-AI-v1.7-Hourly-Unsigned.apk")
ref={
    "AndroidManifest.xml":"5a3ad4652d31bdae",
    "classes.dex":"7355824e1faf045c",
    "classes2.dex":"8e8172c9bdad0379",
    "classes3.dex":"cfddb0d4f592c47a",
    "classes4.dex":"895988e61db010e5",
    "assets/shamna-frame-support.js":"dcc67afeb759df1d",
}
with ZipFile(base) as z:
    for n,prefix in ref.items():
        if not hashlib.sha256(z.read(n)).hexdigest().startswith(prefix):
            raise SystemExit("Baseline mismatch; refusing Shamna update: "+n)
print("PASS: verified original Shamna QA v1.6 baseline")
run("java","-jar","apktool.jar","d","-f",str(base),"-o","shamna_unpacked")
yml=Path("shamna_unpacked/apktool.yml")
y=yml.read_text("utf-8")
if "renameManifestPackage: com.shamna.qa" not in y:
    raise SystemExit("QA package rename mapping unexpectedly absent")
y,n=re.subn(r"(?m)^(  versionCode:)\s*\d+\s*$",r"\g<1> 8",y)
y,m=re.subn(r"(?m)^(  versionName:)\s*[^\n]+$",r"\g<1> 1.7",y)
if n!=1 or m!=1:raise SystemExit("Cannot safely set v1.7 metadata")
yml.write_text(y,"utf-8")
src=Path("android-updater/ShamnaUpdateManager.java").read_text("utf-8")
src=src.replace('com.shamna.ai".equals(activity.getPackageName())',
                'com.shamna.qa".equals(activity.getPackageName())')
src=src.replace("main/shamna-update.json","main/shamna-qa-update.json")
anchor="        instance.start();"
if src.count(anchor)!=1:raise SystemExit("Updater init changed")
src=src.replace(anchor,anchor+"\n        ShamnaHeritageNotifications.start(activity);",1)
root=Path("java-src/com/shamna/ai")
root.mkdir(parents=True,exist_ok=True)
(root/"ShamnaUpdateManager.java").write_text(src,"utf-8")
for name,path in [
  ("ShamnaApkVersionProbe.java","android-updater/ShamnaApkVersionProbe.java"),
  ("ShamnaHeritageNotifications.java","android-heritage/ShamnaHeritageNotifications.java"),
  ("ShamnaHeritageFacts.java","android-heritage/ShamnaHeritageFacts.java"),
  ("ShamnaHeritageSelectedFacts.java","android-heritage/ShamnaHeritageSelectedFacts.java"),
]:
    data=Path(path).read_text("utf-8")
    (root/name).write_text(data,"utf-8")
assert (root/"ShamnaHeritageSelectedFacts.java").read_text("utf-8").count("new ShamnaHeritageFacts.Fact(")==50
Path("classes").mkdir(exist_ok=True)
Path("new-dex").mkdir(exist_ok=True)
androidjar=Path(os.environ["ANDROID_HOME"])/"platforms/android-35/android.jar"
run("javac","-source","8","-target","8","-cp",str(androidjar),
    "-d","classes",*(str(x) for x in sorted(root.glob("*.java"))))
run("d8","--min-api","24","--lib",str(androidjar),"--output","new-dex",
    *(str(x) for x in sorted(Path("classes").rglob("*.class"))))
run("java","-jar","apktool.jar","b","shamna_unpacked","-o","compiled.apk")
with ZipFile(base) as old,ZipFile("compiled.apk") as rebuilt,ZipFile(out,"w") as final:
    changed={
      "AndroidManifest.xml":rebuilt.read("AndroidManifest.xml"),
      "classes4.dex":Path("new-dex/classes.dex").read_bytes(),
    }
    for e in old.infolist():
        if e.filename.startswith("META-INF/"):continue
        data=changed.pop(e.filename,None)
        final.writestr(e,old.read(e.filename) if data is None else data)
    if changed:raise SystemExit("Unexpected DEX or manifest layout")
with ZipFile(base) as old,ZipFile(out) as fresh:
    names={n for n in old.namelist() if not n.startswith("META-INF/")}
    if names!=set(fresh.namelist()):raise SystemExit("Unapproved file additions or removal")
    delta={n for n in names if old.read(n)!=fresh.read(n)}
    if delta!={"AndroidManifest.xml","classes4.dex"}:
        raise SystemExit("Unexpected modifications of original app files: "+str(delta))
    dex=fresh.read("classes4.dex")
    for required in (b"ShamnaHeritageNotifications",b"ShamnaHeritageSelectedFacts",
                     b"ShamnaApkVersionProbe",b"shamna-qa-update.json"):
        if required not in dex:raise SystemExit("Missing expected retained behavior")
run("zipalign","-f","-p","4",str(out),"Shamna-AI-v1.7-Hourly-Aligned-Unsigned.apk")
badging=subprocess.check_output(["aapt","dump","badging",
    "Shamna-AI-v1.7-Hourly-Aligned-Unsigned.apk"],text=True).splitlines()[0]
if "package: name='com.shamna.qa' versionCode='8' versionName='1.7'" not in badging:
    raise SystemExit("Wrong package or version "+badging)
print("PASS: Shamna 1.7 only manifest and heritage DEX changed, 79 facts, scheduled every clock hour.")
