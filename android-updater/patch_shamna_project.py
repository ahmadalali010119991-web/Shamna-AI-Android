#!/usr/bin/env python3
"""Apply Shamna's additive native updater AFTER all legacy CI source patches."""
from pathlib import Path
import re
import shutil

main = Path("app/src/main/java/com/shamna/ai/MainActivity.java")
target = main.with_name("ShamnaUpdateManager.java")
manifest = Path("app/src/main/AndroidManifest.xml")
if not main.exists() or not manifest.exists():
    raise SystemExit("Missing original Android project; refusing to create a different app")
shutil.copyfile("android-updater/ShamnaUpdateManager.java", target)
shutil.copyfile("android-updater/ShamnaApkVersionProbe.java", main.with_name("ShamnaApkVersionProbe.java"))
src = main.read_text("utf-8")
marker = "SHAMNA_NATIVE_UPDATE_INIT"
if marker not in src:
    match = re.search(r"^([ \t]*)(setContentView\s*\([^;\n]+\);)", src, flags=re.M)
    if not match:
        raise SystemExit("Cannot identify activity init; refusing a partial updater release")
    addition = (match.group(0) + "\n" + match.group(1)
                + "// " + marker + "\n" + match.group(1)
                + "ShamnaUpdateManager.attach(this);")
    src = src[:match.start()] + addition + src[match.end():]
    main.write_text(src, encoding="utf-8")
xml = manifest.read_text("utf-8")
for permission in ["android.permission.INTERNET",
                   "android.permission.REQUEST_INSTALL_PACKAGES",
                   "android.permission.POST_NOTIFICATIONS"]:
    if f'android:name="{permission}"' not in xml:
        root_end = xml.find("<application")
        if root_end < 0:
            raise SystemExit("Cannot find Android application; refusing partial patch")
        xml = (xml[:root_end] + f'<uses-permission android:name="{permission}"/>\n'
               + xml[root_end:])
manifest.write_text(xml, encoding="utf-8")
gradle = Path("app/build.gradle").read_text("utf-8")
if "com.shamna.ai" not in gradle:
    raise SystemExit("Project package was changed; refusing unsafe updates")
if "SHAMNA_NATIVE_UPDATE_INIT" not in main.read_text("utf-8"):
    raise SystemExit("Updater was not attached")
if "ShamnaUpdateManager.java" not in str(target):
    raise SystemExit("Updater class missing")
print("PASS: additive Shamna updater copied, initialized and manifest permissions declared")
