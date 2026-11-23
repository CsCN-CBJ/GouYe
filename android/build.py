#!/usr/bin/env python3
"""用 Android SDK 和 Java 17 或更新版本打包本机安装版。"""

import argparse
import errno
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile


PROJECT = Path(__file__).resolve().parent
VERSION = "1.2.1"
VERSION_CODE = 6
MIN_API = "28"
APP_ID = "com.gouye.app"
KEY_ALIAS = "gouye"
SIGNER_PIN = PROJECT / "release-certificate.sha256"


def toolchain():
    sdk_path = os.getenv("ANDROID_HOME") or os.getenv("ANDROID_SDK_ROOT")
    sdk = Path(sdk_path).expanduser() if sdk_path else Path.home() / "Library/Android/sdk"
    cache = Path("/tmp/gouye-android-demo-tools")
    platform = sdk / "platforms/android-35/android.jar"
    builds = sorted((sdk / "build-tools").glob("*/aapt2"), reverse=True)
    if not platform.is_file() or not builds:
        platform = cache / "android.jar"
        builds = sorted((cache / "build-tools").glob("*/aapt2"), reverse=True)
    if not platform.is_file() or not builds:
        raise SystemExit("请安装 Android SDK Platform 35 和 Build Tools，并设置 ANDROID_HOME。")
    java_path = os.getenv("JAVA_HOME")
    java_home = Path(java_path) if java_path else cache / "fallback/jdk-17.0.17-lite.jdk"
    java = java_home / "bin"
    if not (java / "javac").is_file():
        java = Path(shutil.which("javac") or "/missing/bin").parent
        if not (java / "javac").is_file():
            raise SystemExit("请安装 Java 17 并设置 JAVA_HOME。")
        java_home = None
    env = os.environ.copy()
    if java_home is not None:
        env["JAVA_HOME"] = str(java_home)
    return platform, builds[0].parent, java, env


def signing_key(java, run):
    configured_signing = os.getenv("GOUYE_ANDROID_SIGNING_DIR")
    signing = Path(configured_signing).expanduser().resolve() if configured_signing else PROJECT / ".signing"
    signing.mkdir(mode=0o700, exist_ok=True)
    profile = signing / "gouye-release"
    keystore = profile / "gouye.p12"
    password = profile / "password"
    if keystore.is_file() and password.is_file():
        return keystore, password
    if profile.exists() or SIGNER_PIN.exists():
        raise SystemExit("签名资料不全，请找回原来的签名文件，避免无法覆盖安装。")
    with tempfile.TemporaryDirectory(dir=signing) as temporary:
        stage = Path(temporary) / profile.name
        stage.mkdir()
        staged_password = stage / password.name
        staged_key = stage / keystore.name
        staged_password.write_text(secrets.token_hex(32) + "\n", encoding="ascii")
        run(java / "keytool", "-genkeypair", "-keystore", staged_key, "-storetype", "PKCS12",
            "-storepass:file", staged_password, "-keypass:file", staged_password, "-alias", KEY_ALIAS,
            "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-dname", "CN=Gouye")
        try:
            stage.rename(profile)
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY) or not (
                    keystore.is_file() and password.is_file()):
                raise
    return keystore, password


def release_bundle(releases, apk, version, version_code):
    release_dir = releases / "发布内容"
    zip_path = f"versions/{version_code}/gouye-v{version_code}.zip"
    bundle = release_dir / zip_path
    bundle.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=release_dir) as temporary:
        stage = Path(temporary)
        compressed = stage / "app.zip"
        with ZipFile(compressed, "w", ZIP_DEFLATED) as archive:
            archive.write(apk, "app.apk")
        manifest = {
            "applicationId": APP_ID,
            "versionCode": version_code,
            "versionName": version,
            "zipPath": zip_path,
            "zipBytes": compressed.stat().st_size,
            "zipSha256": sha256(compressed.read_bytes()).hexdigest(),
            "apkBytes": apk.stat().st_size,
            "apkSha256": sha256(apk.read_bytes()).hexdigest(),
        }
        listing = stage / "latest.json"
        listing.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        os.replace(compressed, bundle)
        os.replace(listing, release_dir / "latest.json")


def build(version, version_code, output):
    platform, android, java, env = toolchain()

    def run(*args):
        subprocess.run(args, env=env, check=True)

    os.umask(0o077)
    releases = output.resolve()
    releases.mkdir(parents=True, exist_ok=True)
    apk = releases / f"狗爷-v{version}.apk"
    with tempfile.TemporaryDirectory(dir=releases) as temporary:
        stage = Path(temporary)
        classes = stage / "classes"
        classes.mkdir()
        dex = stage / "dex"
        dex.mkdir()
        run(java / "javac", "--release", "8", "-encoding", "UTF-8", "-classpath", platform,
            "-d", classes, *sorted((PROJECT / "src").rglob("*.java")))
        run(android / "d8", "--lib", platform, "--min-api", MIN_API, "--output", dex,
            *sorted(classes.rglob("*.class")))
        unsigned = stage / "unsigned.apk"
        resources = stage / "resources.zip"
        run(android / "aapt2", "compile", "--dir", PROJECT / "res", "-o", resources)
        assets = PROJECT / "assets"
        asset_args = ("-A", assets) if assets.is_dir() else ()
        run(android / "aapt2", "link", "-I", platform, "--manifest", PROJECT / "AndroidManifest.xml",
            "--version-code", str(version_code), "--version-name", version, *asset_args, "-o", unsigned, resources)
        badging = subprocess.check_output([android / "aapt2", "dump", "badging", unsigned], text=True, env=env)
        identity = f"package: name='{APP_ID}' versionCode='{version_code}' versionName='{version}'"
        if not badging.startswith(identity):
            raise SystemExit("安装包的应用标识或版本与狗爷正式版配置不一致。")
        with ZipFile(unsigned, "a", ZIP_DEFLATED) as archive:
            archive.write(dex / "classes.dex", "classes.dex")
        aligned = stage / "aligned.apk"
        run(android / "zipalign", "-f", "4", unsigned, aligned)
        keystore, password = signing_key(java, run)
        finished = stage / "signed.apk"
        run(android / "apksigner", "sign", "--ks", keystore, "--ks-key-alias", KEY_ALIAS,
            "--ks-pass", f"file:{password}", "--v4-signing-enabled", "false", "--out", finished, aligned)
        verification = subprocess.check_output(
            [android / "apksigner", "verify", "--verbose", "--print-certs", finished],
            env=env, text=True,
        )
        signer = re.search(r"certificate SHA-256 digest: ([0-9a-f]{64})", verification)
        if signer is None:
            raise SystemExit("无法验证正式安装包的签名。")
        fingerprint = signer.group(1)
        try:
            with SIGNER_PIN.open("x", encoding="ascii") as target:
                target.write(fingerprint + "\n")
        except FileExistsError:
            if SIGNER_PIN.read_text(encoding="ascii").strip() != fingerprint:
                raise SystemExit("签名与正式版首发签名不一致。")
        os.replace(finished, apk)
    release_bundle(releases, apk, version, version_code)
    print(apk)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", default=VERSION)
    parser.add_argument("--version-code", type=int, default=VERSION_CODE)
    parser.add_argument("--output", type=Path, default=PROJECT / "构建产物")
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}", args.version) or not 0 < args.version_code < 2 ** 31:
        parser.error("请使用形如 1.0.0 的版本名及正整数版本号。")
    build(args.version, args.version_code, args.output)
