#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"

flutter create \
  --platforms=android,ios \
  --org com.suqnaa \
  --project-name suqnaa \
  .

python3 - <<'PY'
from pathlib import Path
import re
import shutil

android_kts = Path('android/app/build.gradle.kts')
android_groovy = Path('android/app/build.gradle')

if android_kts.exists():
    text = android_kts.read_text()
    text = text.replace('minSdk = flutter.minSdkVersion', 'minSdk = 23')
    text = re.sub(r'namespace\s*=\s*"[^"]+"', 'namespace = "com.suqnaa.app"', text)
    text = re.sub(r'applicationId\s*=\s*"[^"]+"', 'applicationId = "com.suqnaa.app"', text)
    android_kts.write_text(text)
elif android_groovy.exists():
    text = android_groovy.read_text()
    text = text.replace('minSdkVersion flutter.minSdkVersion', 'minSdkVersion 23')
    text = re.sub(r'namespace\s+["\'][^"\']+["\']', 'namespace "com.suqnaa.app"', text)
    text = re.sub(r'applicationId\s+["\'][^"\']+["\']', 'applicationId "com.suqnaa.app"', text)
    android_groovy.write_text(text)

manifest = Path('android/app/src/main/AndroidManifest.xml')
if manifest.exists():
    text = manifest.read_text()
    if 'android:allowBackup=' not in text:
        text = text.replace('<application', '<application\n        android:allowBackup="false"', 1)
    manifest.write_text(text)

for source in list(Path('android/app/src/main').rglob('MainActivity.kt')) + list(Path('android/app/src/main').rglob('MainActivity.java')):
    text = source.read_text()
    text = re.sub(r'^package\s+[\w.]+', 'package com.suqnaa.app', text, count=1, flags=re.MULTILINE)
    destination = Path('android/app/src/main') / ('kotlin' if source.suffix == '.kt' else 'java') / 'com/suqnaa/app' / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text)
    if source.resolve() != destination.resolve():
        source.unlink()
        parent = source.parent
        root = Path('android/app/src/main') / ('kotlin' if source.suffix == '.kt' else 'java')
        while parent != root and parent.exists() and not any(parent.iterdir()):
            empty = parent
            parent = parent.parent
            empty.rmdir()

entitlements = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>keychain-access-groups</key>
    <array/>
</dict>
</plist>
'''
runner = Path('ios/Runner')
runner.mkdir(parents=True, exist_ok=True)
(runner / 'DebugProfile.entitlements').write_text(entitlements)
(runner / 'Release.entitlements').write_text(entitlements)

project = Path('ios/Runner.xcodeproj/project.pbxproj')
if project.exists():
    text = project.read_text()
    text = text.replace('com.suqnaa.suqnaa.RunnerTests', 'com.suqnaa.app.RunnerTests')
    text = text.replace('com.suqnaa.suqnaa', 'com.suqnaa.app')

    block_pattern = re.compile(
        r'(/\* (Debug|Release|Profile) \*/ = \{\n\s*isa = XCBuildConfiguration;\n\s*buildSettings = \{\n)(.*?)(\n\s*\};\n\s*name = \2;\n\s*\};)',
        re.DOTALL,
    )

    def add_entitlement(match):
        start, config, body, end = match.groups()
        if 'PRODUCT_BUNDLE_IDENTIFIER' not in body or 'CODE_SIGN_ENTITLEMENTS' in body:
            return match.group(0)
        file_name = 'Release.entitlements' if config == 'Release' else 'DebugProfile.entitlements'
        indentation = '\t\t\t\t'
        body = f'{indentation}CODE_SIGN_ENTITLEMENTS = Runner/{file_name};\n' + body
        return start + body + end

    project.write_text(block_pattern.sub(add_entitlement, text))
PY

echo "Generated and hardened Android and iOS platform folders for Suqnaa."
echo "Android application id: com.suqnaa.app (minimum API 23, backup disabled)."
echo "iOS bundle id: com.suqnaa.app (Keychain Sharing entitlements added)."
echo "Review native signing and store settings before release builds."
