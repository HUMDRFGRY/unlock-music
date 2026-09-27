#!/usr/bin/env python3
"""Package verified CI outputs; this script never compiles or fabricates an APK."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]

def get_version(root: Path) -> str:
    version = (root / 'offline/VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('offline/VERSION must contain a numeric x.y.z version')
    gradle = (root / 'android/app/build.gradle').read_text(encoding='utf-8')
    if not re.search(r"versionName\s+['\"]" + re.escape(version) + r"['\"]", gradle):
        raise ValueError('Android versionName and offline/VERSION differ')
    return version

def package(root: Path, destination: Path, source_sha: str) -> list[str]:
    version = get_version(root)
    if not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('GITHUB_SHA must be the exact source commit SHA')
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Output directory must be empty; refusing to mix builds')
    web = root / 'offline/index.html'
    apk = root / 'android/app/build/outputs/apk/debug/app-debug.apk'
    if not web.is_file() or not apk.is_file():
        raise FileNotFoundError('Build both offline/index.html and app-debug.apk first')
    with zipfile.ZipFile(apk) as archive:
        required = {'AndroidManifest.xml', 'classes.dex', 'assets/index.html'}
        if not required.issubset(archive.namelist()) or archive.testzip():
            raise ValueError('APK is incomplete or has invalid ZIP CRC')
        if archive.read('assets/index.html') != web.read_bytes():
            raise ValueError('APK bundled page differs from standalone HTML')
    evidence = [
        root / 'offline/tests/engine-results.json',
        root / 'offline/tests/browser-results.json',
        root / 'offline/tests/mobile-results.json',
    ]
    for item in evidence:
        data = json.loads(item.read_text(encoding='utf-8'))
        tests = data.get('tests', [])
        if not tests or any(t.get('status') != 'PASS' for t in tests):
            raise ValueError(f'Test evidence missing or failing: {item}')
    destination.mkdir(parents=True, exist_ok=True)
    prefix = f'unlock-music-offline-{version}'
    shutil.copy2(apk, destination / f'{prefix}-debug.apk')
    shutil.copy2(web, destination / f'{prefix}.html')
    with zipfile.ZipFile(destination / f'{prefix}-web.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for item in ['index.html', 'LICENSE', 'README.md', 'UPSTREAM.md']:
            archive.write(root / 'offline' / item, f'{prefix}/{item}')
    with zipfile.ZipFile(destination / 'TEST-EVIDENCE.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for item in evidence:
            archive.write(item, item.relative_to(root).as_posix())
        for relative in ['android/app/build/reports/lint-results-debug.html',
                         'android/tests/native-ci.log', 'android/tests/apk-signature-ci.log']:
            item = root / relative
            if not item.is_file():
                raise FileNotFoundError(f'CI evidence missing: {relative}')
            archive.write(item, relative)
    info = {
        'version': version, 'source_commit': source_sha,
        'repository': os.environ.get('GITHUB_REPOSITORY', 'HUMDRFGRY/unlock-music'),
        'run_id': os.environ.get('GITHUB_RUN_ID'),
        'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
        'android_variant': 'debug', 'production_signing': False,
        'android_device_tested': False,
        'note': 'Debug-signed demo; browser/JVM tests are not Android device tests.',
        'web_sha256': hashlib.sha256(web.read_bytes()).hexdigest(),
        'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
    }
    (destination / 'BUILD-INFO.json').write_text(json.dumps(info, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    names = sorted(item.name for item in destination.iterdir() if item.is_file())
    (destination / 'SHA256SUMS.txt').write_text(''.join(
        f'{hashlib.sha256((destination/name).read_bytes()).hexdigest()}  {name}\n' for name in names
    ), encoding='utf-8')
    return names + ['SHA256SUMS.txt']

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version-only', action='store_true')
    args = parser.parse_args()
    if args.version_only:
        print(get_version(ROOT))
    else:
        for name in package(ROOT, ROOT/'artifacts', os.environ.get('GITHUB_SHA','')):
            print(name)
