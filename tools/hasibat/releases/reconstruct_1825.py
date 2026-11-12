#!/usr/bin/env python3
"""Reassemble the exact pre-signed official 1.8.25 from 1.8.24 and its tiny patch.
No private signing keys or passwords are handled in GitHub Actions.
The reconstruction is accepted only if BOTH public APK SHA-256 digests match.
"""
import base64
import hashlib
import json
import pathlib
import sys
import zlib

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: reconstruct.py original-v1.8.24.apk recipe.json output-v1.8.25.apk")
    old_path, recipe_path, target_path = map(pathlib.Path, sys.argv[1:])
    old = old_path.read_bytes()
    recipe = json.loads(recipe_path.read_text())
    if recipe["format"] != "hasibat-reconstruct-from-1.8.24-v1":
        raise SystemExit("Unknown APK reconstruction format")
    if sha(old) != recipe["original_sha256"]:
        raise SystemExit("Original APK hash mismatch; refusing to reconstruct")
    if recipe["original_sha256"] != "d25fd6312a01aae5789dd60d9b1e6b873b82e178fcafa324ff0c458b77aefdbe":
        raise SystemExit("Unrecognized original v1.8.24 APK")
    if recipe["output_sha256"] != "7e33b13e78027a27ead931aa1f8bc739e20880598f7fb162d3b6cffb611575d4":
        raise SystemExit("Unrecognized pre-signed v1.8.25 APK target")
    out = bytearray()
    for entry in recipe["entries"]:
        if entry[0] == "c":
            start, length = entry[1], entry[2]
            if not isinstance(start, int) or not isinstance(length, int) or start < 0 or length < 1 or start + length > len(old):
                raise SystemExit("Invalid copy segment in recipe")
            out.extend(old[start:start + length])
        elif entry[0] == "d":
            out.extend(zlib.decompress(base64.b64decode(entry[1], validate=True)))
        else:
            raise SystemExit("Invalid patch segment")
        if len(out) > 30_000_000:
            raise SystemExit("Output exceeds allowed APK limit")
    if len(out) != recipe["bytes"] or sha(out) != recipe["output_sha256"]:
        raise SystemExit("Reconstructed APK failed byte-for-byte verification")
    target_path.write_bytes(out)
    print(f"VERIFIED: SHA-256 {sha(out)}; size={len(out)} bytes")

if __name__ == "__main__":
    main()
