#!/usr/bin/env python3
"""Prepare the Radio Sunna asset for Hasibat, without changing unrelated features.
Important: This produces a patched HTML resource, NOT a signed Android APK.
"""
import hashlib,sys
from pathlib import Path
from zipfile import ZipFile
BASE_SHA='d25fd6312a01aae5789dd60d9b1e6b873b82e178fcafa324ff0c458b77aefdbe'
RADIO_FROM='https://radio.al7eah.net/8010/stream'
RADIO_TO='https://radiosunna.radioca.st/stream'
def prepare(apk:Path,output:Path):
    if hashlib.sha256(apk.read_bytes()).hexdigest()!=BASE_SHA:
        raise ValueError('Unexpected APK identity: use original v1.8.24')
    with ZipFile(apk) as z: old=z.read('assets/index.html').decode('utf8')
    if old.count('ميراث الأنبياء')!=3 or old.count(RADIO_FROM)!=1:
        raise ValueError('Unexpected radio layout, patch refused')
    new=(old.replace('ميراث الأنبياء','السنة (Radio Sunna)')
      .replace(RADIO_FROM,RADIO_TO)
      .replace('new Miraath beside it','new Radio Sunna beside it')
      .replace('// Miraath Radio:','// Radio Sunna:'))
    for feature in ('miraathRadioCard','miraathRadioToggle','miraathRadioAudio',
                    'world-currencies.js','share-results.js','hasibat-radio-start',
                    'fuel-widget.js'):
        if old.count(feature)!=new.count(feature):
            raise ValueError('An unrelated feature changed: '+feature)
    if RADIO_FROM in new or 'ميراث الأنبياء' in new:
        raise ValueError('Old station reference remains')
    output.write_text(new,encoding='utf8')
    print('PATCHED_RESOURCE_SHA256',hashlib.sha256(new.encode()).hexdigest())
    print('RELEASE_BLOCKED_UNTIL_SIGNED_WITH_ORIGINAL_CERTIFICATE')
if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Usage: script original-v1.8.24.apk out-index.html')
    prepare(Path(sys.argv[1]),Path(sys.argv[2]))
