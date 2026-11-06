#!/usr/bin/env python3
"""Build Shamna QA 1.6 using the audited QA 1.5 APK; NO original content removed."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, os, re, subprocess, wave

BASE=Path("base.apk")
UNSIGNED=Path("Shamna-AI-v1.6-Heritage-Unsigned.apk")
ALIGNED=Path("Shamna-AI-v1.6-Heritage-Aligned-Unsigned.apk")
EXPECTED={
    "AndroidManifest.xml":"97a53490ad123f12",
    "classes2.dex":"8e8172c9bdad0379",
    "classes.dex":"7355824e1faf045c",
    "classes3.dex":"cfddb0d4f592c47a",
    "classes4.dex":"b757ce92cb6565d2",
    "assets/shamna-frame-support.js":"dcc67afeb759df1d",
}
def run(*args):
    print("RUN:", " ".join(args),flush=True)
    subprocess.run(list(args),check=True)

def check_baseline():
    if not BASE.is_file():raise RuntimeError("No Shamna QA 1.5 baseline")
    with ZipFile(BASE) as app:
        for name,digest in EXPECTED.items():
            if not hashlib.sha256(app.read(name)).hexdigest().startswith(digest):
                raise RuntimeError("STOP: unverified Shamna 1.5 source file: "+name)
    result=subprocess.check_output(["aapt","dump","badging",str(BASE)],text=True).splitlines()[0]
    if "package: name='com.shamna.qa' versionCode='6' versionName='1.5'" not in result:
        raise RuntimeError("STOP: package/version unexpectedly changed: "+result)
    print("PASS: exact audited Shamna QA 1.5 baseline")

def prepare_manifest():
    run("java","-jar","apktool.jar","d","-f",str(BASE),"-o","unpack")
    manifest=Path("unpack/AndroidManifest.xml")
    xml=manifest.read_text("utf-8")
    if 'package="com.shamna.ai"' not in xml or xml.count("</application>")!=1:
        raise RuntimeError("Unexpected Apktool package mapping")
    yml=Path("unpack/apktool.yml")
    y=yml.read_text("utf-8")
    if "renameManifestPackage: com.shamna.qa" not in y:
        raise RuntimeError("QA package alias lost")
    y,n=re.subn(r"(?m)^(  versionCode:)\s*\d+\s*$",r"\g<1> 7",y)
    y,m=re.subn(r"(?m)^(  versionName:)\s*[^\n]+$",r"\g<1> 1.6",y)
    if n!=1 or m!=1:raise RuntimeError("VersionCode/name patch failed")
    yml.write_text(y,"utf-8")
    for permission in ("android.permission.RECEIVE_BOOT_COMPLETED",
                       "android.permission.POST_NOTIFICATIONS"):
        if f'android:name="{permission}"' not in xml:
            xml=xml.replace("<application",
                f'<uses-permission android:name="{permission}"/>\n    <application',1)
    extra="""
      <receiver android:name="com.shamna.ai.ShamnaHeritageNotifications$AlarmReceiver"
                android:enabled="true" android:exported="false"/>
      <receiver android:name="com.shamna.ai.ShamnaHeritageNotifications$BootReceiver"
                android:enabled="true" android:exported="true">
          <intent-filter>
              <action android:name="android.intent.action.BOOT_COMPLETED"/>
              <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
          </intent-filter>
      </receiver>
      <activity android:name="com.shamna.ai.ShamnaHeritageNotifications$ReaderActivity"
                android:exported="false" android:excludeFromRecents="true"
                android:theme="@android:style/Theme.Material.Dialog.NoActionBar"
                android:label="معلومة من تراثنا"/>
      <provider android:name="com.shamna.ai.ShamnaHeritageNotifications$SoundProvider"
                android:authorities="com.shamna.qa.heritage.audio"
                android:exported="true" android:grantUriPermissions="true"/>
    """
    xml=xml.replace("</application>",extra+"\n    </application>",1)
    manifest.write_text(xml,"utf-8")

def build_dex():
    root=Path("java-src/com/shamna/ai")
    root.mkdir(parents=True,exist_ok=True)
    manager=Path("android-updater/ShamnaUpdateManager.java").read_text("utf-8")
    manager=manager.replace('com.shamna.ai".equals(activity.getPackageName())',
                            'com.shamna.qa".equals(activity.getPackageName())')
    manager=manager.replace("main/shamna-update.json","main/shamna-qa-update.json")
    anchor="        instance.start();"
    if manager.count(anchor)!=1:
        raise RuntimeError("Updater startup changed; refusing hook")
    manager=manager.replace(anchor,anchor+"\n        ShamnaHeritageNotifications.start(activity);",1)
    for required in ("ShamnaApkVersionProbe.inspectRemote",
                     "shamna-qa-update.json",
                     "ShamnaHeritageNotifications.start(activity)"):
        if required not in manager:raise RuntimeError("Existing updater regression: "+required)
    (root/"ShamnaUpdateManager.java").write_text(manager,"utf-8")
    for name,source in (
        ("ShamnaApkVersionProbe.java","android-updater/ShamnaApkVersionProbe.java"),
        ("ShamnaHeritageFacts.java","android-heritage/ShamnaHeritageFacts.java"),
        ("ShamnaHeritageNotifications.java","android-heritage/ShamnaHeritageNotifications.java"),
    ):
        (root/name).write_text(Path(source).read_text("utf-8"),"utf-8")
    Path("java-classes").mkdir(exist_ok=True)
    Path("new-dex").mkdir(exist_ok=True)
    jar=Path(os.environ["ANDROID_HOME"])/"platforms/android-35/android.jar"
    source_files=sorted(str(p) for p in root.glob("*.java"))
    run("javac","-source","8","-target","8","-cp",str(jar),
        "-d","java-classes",*source_files)
    classes=sorted(str(p) for p in Path("java-classes").rglob("*.class"))
    run("d8","--min-api","24","--lib",str(jar),"--output","new-dex",*classes)
    if not Path("new-dex/classes.dex").is_file():raise RuntimeError("Missing DEX")
    run("python3","android-heritage/make_soft_chime.py")
    with wave.open("shamna_heritage_chime.wav","rb") as sound:
        if sound.getnchannels()!=1 or sound.getsampwidth()!=2 or sound.getnframes()>30000:
            raise RuntimeError("Invalid gentle chime")
    run("java","-jar","apktool.jar","b","unpack","-o","apktool-rebuilt.apk")

def merge():
    with ZipFile(BASE) as src, ZipFile("apktool-rebuilt.apk") as rebuilt, \
         ZipFile(UNSIGNED,"w") as final:
        changed={"AndroidManifest.xml":rebuilt.read("AndroidManifest.xml"),
                 "classes4.dex":Path("new-dex/classes.dex").read_bytes()}
        for entry in src.infolist():
            if entry.filename.startswith("META-INF/"):continue
            payload=changed.pop(entry.filename,None)
            if payload is None:payload=src.read(entry.filename)
            final.writestr(entry,payload)
        if changed:raise RuntimeError("Source missing manifest/classes4")
        final.writestr("assets/shamna_heritage_chime.wav",
            Path("shamna_heritage_chime.wav").read_bytes(),compress_type=ZIP_DEFLATED)
    with ZipFile(BASE) as src,ZipFile(UNSIGNED) as final:
        old={n for n in src.namelist() if not n.startswith("META-INF/")}
        new=set(final.namelist())
        if new != old|{"assets/shamna_heritage_chime.wav"}:
            raise RuntimeError("Original app file list changed unexpectedly")
        modified={n for n in old if src.read(n)!=final.read(n)}
        if modified!={"AndroidManifest.xml","classes4.dex"}:
            raise RuntimeError("Unexpected change to Shamna content: "+str(modified))
        dex=final.read("classes4.dex")
        for required in (b"ShamnaHeritageNotifications",b"ShamnaHeritageFacts",
                         b"ShamnaApkVersionProbe",b"shamna-qa-update.json"):
            if required not in dex:raise RuntimeError("Missing additive code: "+str(required))
        if len(final.read("assets/shamna_heritage_chime.wav"))<10000:
            raise RuntimeError("Chime asset unexpectedly short")
    run("zipalign","-f","-p","4",str(UNSIGNED),str(ALIGNED))
    badging=subprocess.check_output(["aapt","dump","badging",str(ALIGNED)],text=True).splitlines()[0]
    if "package: name='com.shamna.qa' versionCode='7' versionName='1.6'" not in badging:
        raise RuntimeError("Incorrect app identity: "+badging)
    print("PASS: all original chat, WebView, voice, downloads and camera files byte-for-byte preserved.")
    print("PASS: only manifest, heritage scheduler classes, original soft chime added.")
    print("Unsigned candidate:",ALIGNED.stat().st_size,"bytes")

if __name__=="__main__":
    check_baseline()
    prepare_manifest()
    build_dex()
    merge()
