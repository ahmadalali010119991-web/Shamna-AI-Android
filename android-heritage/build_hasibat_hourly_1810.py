#!/usr/bin/env python3
"""Preserve exact Hasibat 1.8.9 files; add 79 hourly heritage notices in 1.8.10."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, os, re, subprocess

BASE=Path("base-hasibat.apk")
OUT=Path("Hasibat-v1.8.10-Hourly-Unsigned.apk")
EXPECTED="00630b6141ae028db61c9649df907c482c57a7386ad1d032cea3e6392c5a0b81"

def run(*args):
    print("RUN",args[0],flush=True)
    subprocess.run(args,check=True)

if not BASE.is_file() or hashlib.sha256(BASE.read_bytes()).hexdigest()!=EXPECTED:
    raise SystemExit("Cannot verify the 1.8.9 input APK; no patch.")
run("java","-jar","apktool.jar","d","-f",str(BASE),"-o","hasibat-decompiled")
yml=Path("hasibat-decompiled/apktool.yml")
y=yml.read_text("utf-8")
if "renameManifestPackage: null" not in y:raise SystemExit("APK identity mapping changed")
y,n=re.subn(r"(?m)^(  versionCode:)\s*\d+\s*$",r"\g<1> 23",y)
y,m=re.subn(r"(?m)^(  versionName:)\s*[^\n]+$",r"\g<1> 1.8.10",y)
if n!=1 or m!=1:raise SystemExit("Cannot set release version")
yml.write_text(y,"utf-8")

root=Path("hasibat-decompiled/smali/com/syrianlira/calculator")
checks={"MainActivity":1,"InAppUpdater":4,"UpdateMonitor":1}
for stem,count in checks.items():
    p=root/(stem+".smali")
    original=p.read_text("utf-8")
    updated,n=re.subn(r"(?m)^(\s*const/16\s+\w+,\s*)0x16(\s*)$",
        lambda m:m.group(1)+"0x17"+m.group(2),original)
    if n!=count:raise SystemExit("Native update-guard count changed: "+stem+" "+str(n))
    updated,fields=re.subn(
        r"(?m)^(\s*\.field[^\n]*(?:CURRENT_CODE|VERSION_CODE):I\s*=\s*)0x16(\s*)$",
        lambda m:m.group(1)+"0x17"+m.group(2),updated)
    if stem=="MainActivity":
        anchor="    invoke-virtual {p0, p1}, Lcom/syrianlira/calculator/MainActivity;->setContentView(Landroid/view/View;)V"
        if updated.count(anchor)!=1:raise SystemExit("Cannot locate unique MainActivity startup hook")
        hook="    invoke-static {p0}, Lcom/syrianlira/calculator/ShamnaHeritageNotifications;->start(Landroid/app/Activity;)V"
        updated=updated.replace(anchor,anchor+"\n\n"+hook,1)
    p.write_text(updated,"utf-8")
    print("Version guard constants:",stem,n,"fields",fields)

manifest=Path("hasibat-decompiled/AndroidManifest.xml")
xml=manifest.read_text("utf-8")
if 'package="com.syrianlira.calculator"' not in xml or xml.count("</application>")!=1:
    raise SystemExit("Calculator manifest unexpectedly changed")
for permission in ("android.permission.RECEIVE_BOOT_COMPLETED","android.permission.POST_NOTIFICATIONS"):
    if f'android:name="{permission}"' not in xml:
        xml=xml.replace("<application",
            f'<uses-permission android:name="{permission}"/>\n    <application',1)
extra="""
    <receiver android:name="com.syrianlira.calculator.ShamnaHeritageNotifications$AlarmReceiver"
              android:enabled="true" android:exported="false"/>
    <receiver android:name="com.syrianlira.calculator.ShamnaHeritageNotifications$BootReceiver"
              android:enabled="true" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
      </intent-filter>
    </receiver>
    <activity android:name="com.syrianlira.calculator.ShamnaHeritageNotifications$ReaderActivity"
              android:exported="false" android:excludeFromRecents="true"
              android:theme="@android:style/Theme.Material.Dialog.NoActionBar"
              android:label="معلومة من تراثنا"/>
    <provider android:name="com.syrianlira.calculator.ShamnaHeritageNotifications$SoundProvider"
              android:authorities="com.syrianlira.calculator.heritage.audio"
              android:exported="true" android:grantUriPermissions="true"/>
"""
xml=xml.replace("</application>",extra+"\n  </application>",1)
manifest.write_text(xml,"utf-8")

java_root=Path("java-src/com/syrianlira/calculator")
java_root.mkdir(parents=True,exist_ok=True)
for name in ("ShamnaHeritageFacts","ShamnaHeritageSelectedFacts","ShamnaHeritageNotifications"):
    source=Path("android-heritage/"+name+".java").read_text("utf-8")
    source=source.replace("package com.shamna.ai;","package com.syrianlira.calculator;")
    if name=="ShamnaHeritageNotifications":
        source=source.replace('private static final String PACKAGE = "com.shamna.qa";',
                              'private static final String PACKAGE = "com.syrianlira.calculator";')
        source=source.replace("private static final int MINUTE_WITHIN_HOUR = 5;",
                              "private static final int MINUTE_WITHIN_HOUR = 35;")
    (java_root/(name+".java")).write_text(source,"utf-8")
if (java_root/"ShamnaHeritageSelectedFacts.java").read_text("utf-8").count("new ShamnaHeritageFacts.Fact(")!=50:
    raise SystemExit("Additional facts were unexpectedly changed")
Path("java-classes").mkdir(exist_ok=True)
Path("new-dex").mkdir(exist_ok=True)
androidjar=Path(os.environ["ANDROID_HOME"])/"platforms/android-35/android.jar"
run("javac","-source","8","-target","8","-cp",str(androidjar),"-d","java-classes",
    *(str(x) for x in sorted(java_root.glob("*.java"))))
run("d8","--min-api","24","--lib",str(androidjar),"--output","new-dex",
    *(str(x) for x in sorted(Path("java-classes").rglob("*.class"))))
run("python3","android-heritage/make_soft_chime.py")
run("java","-jar","apktool.jar","b","hasibat-decompiled","-o","reassembled.apk")
with ZipFile(BASE) as original,ZipFile("reassembled.apk") as patched, ZipFile("candidate.apk","w") as output:
    updates={"AndroidManifest.xml":patched.read("AndroidManifest.xml"),
             "classes.dex":patched.read("classes.dex")}
    for item in original.infolist():
        if item.filename.startswith("META-INF/"):continue
        content=updates.pop(item.filename,None)
        output.writestr(item,original.read(item.filename) if content is None else content)
    if updates:raise SystemExit("Missing original dex/manifest")
    output.writestr("classes2.dex",Path("new-dex/classes.dex").read_bytes(),compress_type=ZIP_DEFLATED)
    output.writestr("assets/shamna_heritage_chime.wav",
                    Path("shamna_heritage_chime.wav").read_bytes(),compress_type=ZIP_DEFLATED)
with ZipFile(BASE) as before,ZipFile("candidate.apk") as after:
    previous={n for n in before.namelist() if not n.startswith("META-INF/")}
    if set(after.namelist())!=previous|{"classes2.dex","assets/shamna_heritage_chime.wav"}:
        raise SystemExit("Native APK lost/added unexpected files")
    differences={n for n in previous if before.read(n)!=after.read(n)}
    if differences!={"AndroidManifest.xml","classes.dex"}:
        raise SystemExit("Calculator assets altered: "+str(differences))
    for name in ("assets/index.html","assets/books/islam-almutab.pdf",
                 "assets/books/islam-la-yatab.pdf"):
        if before.read(name)!=after.read(name):raise SystemExit("Book or calculator UI changed")
    if b"ShamnaHeritageSelectedFacts" not in after.read("classes2.dex"):
        raise SystemExit("Notification code missing from appended classes2.dex")
run("zipalign","-f","-p","4","candidate.apk",str(OUT))
identity=subprocess.check_output(["aapt","dump","badging",str(OUT)],text=True).splitlines()[0]
if "package: name='com.syrianlira.calculator' versionCode='23' versionName='1.8.10'" not in identity:
    raise SystemExit("Wrong calculator version: "+identity)
print("PASS: calculator 1.8.10 preserves HTML/books/assets, fixes six update guards, adds 79 hourly facts.")
