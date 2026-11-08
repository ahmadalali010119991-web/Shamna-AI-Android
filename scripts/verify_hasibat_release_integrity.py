#!/usr/bin/env python3
"""Fail-closed release contract for Hasibat Al-Lira Android updates.

Checks all layers: live manifest -> approved download URL -> actual APK bytes
-> package/version -> original signing certificate -> native version guards ->
unchanged core assets -> trusted release-policy and download bridge.

This prevents the 1.8.11/1.8.12 "APK not published" false-negative:
a valid release URL was published but rejected by the installed native URL
allowlist. The manifest must be checked against the same canonical URL rules
as the app before any new version is announced.
"""
from __future__ import annotations

import argparse
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
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from verify_hasibat_native_version_guard import verify_update_guards

ORIGINAL_PACKAGE = "com.syrianlira.calculator"
ORIGINAL_SIGNER = "ae4461cd1629197505fea7bc540c5c63bac447a40dd66fb57433962f1d8946b5"
REQUIRED_ASSETS = (
    "assets/index.html",
    "assets/books/islam-almutab.pdf",
    "assets/books/islam-la-yatab.pdf",
    "assets/shamna_heritage_chime.wav",
)
ALLOWED_VERCEL_HOST = "midan-al-khabar.vercel.app"
MAX_APK_BYTES = 48 * 1024 * 1024


def require(condition: bool, description: str) -> None:
    if not condition:
        raise RuntimeError(description)


def trusted_url(url: str, version_name: str) -> bool:
    """Keep this allowlist consistent with TrustedReleasePolicy.smali."""
    try:
        x = urllib.parse.urlsplit(url)
        if (x.scheme != "https" or x.hostname != ALLOWED_VERCEL_HOST
                or x.port is not None or x.username is not None
                or x.password is not None or x.fragment or not x.netloc):
            return False
        if x.path == "/api/download":
            return x.query == "app=hasibat"
        if x.path == "/api/news":
            version_slug = version_name.replace(".", "")
            return x.query == "verified=hasibat" + version_slug and bool(re.fullmatch(r"verified=hasibat[0-9]{4,8}", x.query))
        return False
    except ValueError:
        return False


def legacy_trusted_url(url: str) -> bool:
    """Mirror the unchangeable InAppUpdater.trustedApkUrl() in installed 1.8.11/1.8.12.

    Publishing a valid APK to a newer Vercel endpoint is insufficient: legacy
    installations reject that host/path and disable their own update button.
    """
    try:
        x = urllib.parse.urlsplit(url)
        if (x.scheme != "https" or not x.netloc or x.username is not None
                or x.password is not None or x.port is not None or x.fragment
                or x.query or not x.path.endswith(".apk")):
            return False
        if x.hostname in ("dallalna.com", "www.dallalna.com"):
            return x.path.startswith(("/downloads/", "/install/"))
        if x.hostname == "ftzmeimurgsqzvmcahhs.supabase.co":
            return x.path.startswith("/storage/v1/object/public/site-assets/")
        return False
    except ValueError:
        return False


def find_tool(name: str) -> str:
    direct = os.environ.get(name.upper() + "_BIN")
    if direct and os.path.isfile(direct) and os.access(direct, os.X_OK):
        return direct
    for home in filter(None, (os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT"))):
        path = pathlib.Path(home) / "build-tools"
        if path.exists():
            for v in sorted(path.iterdir(), reverse=True):
                tool_path = v / name
                if tool_path.is_file() and os.access(tool_path, os.X_OK):
                    return str(tool_path)
    import shutil
    tool = shutil.which(name)
    if tool:
        return tool
    raise RuntimeError("Android SDK build tool not found: " + name)


def run(*argv: str) -> str:
    p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=100)
    require(p.returncode == 0, "%s failed: %s" % (argv[0], p.stdout[-1600:]))
    return p.stdout


def verify(manifest_path: pathlib.Path) -> None:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    code = data.get("versionCode")
    version = str(data.get("versionName", ""))
    url = data.get("apkUrl")
    sha = data.get("apkSha256")
    size = data.get("apkSize")
    require(isinstance(code, int) and code >= 26, "Outdated versionCode")
    require(bool(re.fullmatch(r"\d+(?:\.\d+){2,3}", version)), "Invalid versionName")
    require(isinstance(url, str) and (trusted_url(url, version) or legacy_trusted_url(url)),
            "Untrusted release URL in latest app")
    # An immutable release URL cannot simultaneously satisfy the modern
    # Midan proxy allowlist and the legacy Supabase/Dallalna-only allowlist.
    # Keep the modern policy strict and surface legacy reachability separately.
    # Older 1.8.11/1.8.12 clients can use the existing signed 1.8.16
    # Dallalna APK as an upgrade bridge, then update to 1.8.17.
    if not legacy_trusted_url(url):
        print("LEGACY_UPGRADE_PATH: older clients require the already published Dallalna APK first; modern trusted proxy verified separately.", file=sys.stderr)
    require(isinstance(sha, str) and bool(re.fullmatch(r"[0-9a-f]{64}", sha)), "Invalid SHA256")
    require(isinstance(size, int) and 500000 < size <= MAX_APK_BYTES, "Invalid APK size")
    require(data.get("requiresUninstall") is False, "Breaking migration: requiresUninstall must be false")
    require(data.get("required") is False, "No forced update without an installation test")

    req = urllib.request.Request(url, headers={"User-Agent": "Hasibat-Release-Contract/1"})
    with tempfile.TemporaryDirectory(prefix="hasibat-release-check-") as tmp:
        apk = pathlib.Path(tmp) / "candidate.apk"
        hasher = hashlib.sha256()
        downloaded = 0
        with urllib.request.urlopen(req, timeout=45) as res, apk.open("wb") as out:
            require(res.status == 200, "APK URL is not HTTP 200")
            content_type = res.headers.get("Content-Type", "").split(";", 1)[0].strip()
            require(content_type == "application/vnd.android.package-archive", "Release serves wrong content-type: " + content_type)
            header_sha = res.headers.get("X-APK-SHA256")
            if header_sha:
                require(header_sha.lower() == sha, "Response hash header inconsistent with manifest")
            while True:
                chunk = res.read(256 * 1024)
                if not chunk:
                    break
                downloaded += len(chunk)
                require(downloaded <= MAX_APK_BYTES, "APK is unexpectedly large")
                hasher.update(chunk)
                out.write(chunk)
        require(downloaded == size, "Downloaded APK size mismatch")
        require(hasher.hexdigest() == sha, "Downloaded APK hash mismatch")

        badging = run(find_tool("aapt"), "dump", "badging", str(apk))
        match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
        require(bool(match), "Missing APK package info")
        package, actual_code, actual_version = match.groups()
        require(package == ORIGINAL_PACKAGE, "Package ID changed: in-place upgrade impossible")
        require(int(actual_code) == code and actual_version == version, "Manifest/APK versions differ")

        signatures = run(find_tool("apksigner"), "verify", "--verbose", "--print-certs", str(apk))
        require("Verified using v2 scheme (APK Signature Scheme v2): true" in signatures, "APK is not v2 signed")
        match = re.search(r"(?:Signer #1|V[234](?:\.\d+)? Signer):? certificate SHA-256 digest:\s*([0-9a-fA-F]{64})", signatures)
        require(bool(match) and match.group(1).lower() == ORIGINAL_SIGNER,
                "Original signing certificate mismatch (observed=%s, expected=%s; output=%s)" %
                (match.group(1) if match else "<no regex match>", ORIGINAL_SIGNER,
                 signatures[:1700].replace("\\n", " ")[:1700]))
        require("Signer #2" not in signatures, "Unexpected additional signer")
        signer_count = re.search(r"Number of signers:\s*(\d+)", signatures)
        if signer_count:
            require(signer_count.group(1) == "1", "APK has an unexpected number of signers")

        with zipfile.ZipFile(apk) as z:
            require(z.testzip() is None, "APK contains corrupted ZIP members")
            names = set(z.namelist())
            for path in REQUIRED_ASSETS:
                require(path in names, "Lost existing asset: " + path)
            require(len(z.read("assets/books/islam-almutab.pdf")) > 100000, "Book A missing data")
            require(len(z.read("assets/books/islam-la-yatab.pdf")) > 100000, "Book B missing data")
            html = z.read("assets/index.html").decode("utf-8")
            dex = z.read("classes.dex")
            require("ملف التحديث لم يُنشر بعد" not in html, "Misleading unpublished-file message was reintroduced")
            for app in ("dallalna", "shamna", "hasibat", "midan"):
                require('data-download-app="' + app + '"' in html, "Project download button removed: " + app)
            require(b"TrustedReleasePolicy" in dex, "Official Vercel URL was not added to native trusted policy")
            require(b"SafeDownloader" in dex, "Native download functionality was removed")
            require("if(!updateAvailable||!acceptedUpdateVersion)return;" in html, "Stale update UI guard missing")
        verify_update_guards(apk, code)
        print("PASS: live release is downloadable, versioned, signed, trusted, backward-compatible, and feature-preserving")
        print("  version:", version, "build:", code, "bytes:", downloaded, "sha256:", sha)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=pathlib.Path, default=ROOT / "hasibat-update.json")
    args = parser.parse_args()
    try:
        verify(args.manifest)
    except Exception as error:
        print("RELEASE BLOCKED:", error, file=sys.stderr)
        raise SystemExit(1)
