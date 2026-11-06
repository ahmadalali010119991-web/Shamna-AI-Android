#!/usr/bin/env python3
"""Prevent stale inlined Android build numbers from reaching Hasibat users.

The six native update-check sites MUST agree with APK versionCode; the UI
must have a second independent comparison against the installed version.
Fail closed during release syncing if a newly uploaded APK violates this.
"""
import struct
import zipfile

CHECKS={
    ("InAppUpdater","discardOutdatedDownload"):0x1e,
    ("InAppUpdater","lambda$startOrInstall$4"):0x1f,
    ("InAppUpdater","noteLatestVersion"):0,
    ("InAppUpdater","onResume"):0,
    ("MainActivity","lambda$checkUpdates$5"):0x3a,
    ("UpdateMonitor","check"):0x2f,
}
STATIC_FIELDS={("InAppUpdater","VERSION_CODE"),("MainActivity","CURRENT_CODE")}

def u2(d,p):return struct.unpack_from("<H",d,p)[0]
def u4(d,p):return struct.unpack_from("<I",d,p)[0]
def leb(d,p):
    n=0;shift=0
    while True:
        byte=d[p];p+=1
        n|=(byte&127)<<shift;shift+=7
        if byte<128:return n,p

def verify_update_guards(apk_path,expected_code):
    if expected_code<21:return True
    with zipfile.ZipFile(apk_path) as apk:
        dex=apk.read("classes.dex")
        html=apk.read("assets/index.html").decode("utf-8")
    if not all(s in html for s in (
            "function isRealUpdate(data)",
            "function compareNumericReleaseNames(a,b)",
            "if(!isRealUpdate(data))",
            "if(!updateAvailable||!acceptedUpdateVersion)return;")):
        raise RuntimeError("APK has lost its same-or-older version UI guard")
    strings=[]
    for i in range(u4(dex,0x38)):
        p=u4(dex,u4(dex,0x3c)+4*i)
        _,p=leb(dex,p)
        strings.append(dex[p:dex.index(0,p)].decode("utf-8","replace"))
    types=[strings[u4(dex,u4(dex,0x44)+i*4)] for i in range(u4(dex,0x40))]
    methods=[strings[u4(dex,u4(dex,0x5c)+i*8+4)] for i in range(u4(dex,0x58))]
    fields=[strings[u4(dex,u4(dex,0x54)+i*8+4)] for i in range(u4(dex,0x50))]
    checked=set();static_checked=set()
    for i in range(u4(dex,0x60)):
        p=u4(dex,0x64)+i*32
        class_name=types[u4(dex,p)].rsplit("/",1)[-1].rstrip(";")
        data_off=u4(dex,p+24);values_off=u4(dex,p+28)
        if not data_off:continue
        counts=[]
        for _ in range(4):
            n,data_off=leb(dex,data_off);counts.append(n)
        static_names=[];field_id=0
        for _ in range(counts[0]):
            delta,data_off=leb(dex,data_off);field_id+=delta
            _,data_off=leb(dex,data_off)
            static_names.append(fields[field_id])
        for _ in range(counts[1]):
            _,data_off=leb(dex,data_off)
            _,data_off=leb(dex,data_off)
        for count in counts[2:]:
            idx=0
            for _ in range(count):
                delta,data_off=leb(dex,data_off);idx+=delta
                _,data_off=leb(dex,data_off)
                code_off,data_off=leb(dex,data_off)
                pair=(class_name,methods[idx])
                if pair not in CHECKS:continue
                if not code_off:raise RuntimeError("Update method has no code: "+str(pair))
                loc=code_off+16+2*CHECKS[pair]
                opcode=u2(dex,loc)&255;current=u2(dex,loc+2)
                if opcode!=0x13 or current!=expected_code:
                    raise RuntimeError(
                        f"Stale native update comparison at {pair}: "
                        f"embedded={current}, APK={expected_code}")
                checked.add(pair)
        if values_off and class_name in ("MainActivity","InAppUpdater"):
            n,p=leb(dex,values_off)
            for j in range(min(n,len(static_names))):
                tag=dex[p];p+=1
                typ=tag&31;size=0 if typ in (30,31) else (tag>>5)+1
                pair=(class_name,static_names[j])
                if pair in STATIC_FIELDS:
                    value=int.from_bytes(dex[p:p+size],"little")
                    if typ!=4 or value!=expected_code:
                        raise RuntimeError(f"Stale native field {pair}: {value}, expected {expected_code}")
                    static_checked.add(pair)
                p+=size
    if checked!=set(CHECKS) or static_checked!=STATIC_FIELDS:
        raise RuntimeError("Update-check implementation changed without updating its regression guard")
    return True

if __name__=="__main__":
    import sys
    verify_update_guards(sys.argv[1],int(sys.argv[2]))
    print("PASS: native/JS guards match this signed APK versionCode")
