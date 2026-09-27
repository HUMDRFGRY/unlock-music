#!/usr/bin/env python3
"""Fail closed on missing/failed/skipped AndroidJUnitRunner tests; record exact APK."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'coldStartRendersBundledPageWithoutInternetPermission',
    'reloadServesTheBundledDocumentAgain',
    'demoDecodesInsideTheInstalledApk',
    'embeddedImagesAndBlobWorkersStillLoad',
    'realNativeBridgeStagesAndCancelsExport',
    'resourceAndNavigationPolicyRejectsEverythingExceptTheLocalPage',
}

def parse_log(text):
    current = {}; passed = set()
    for line in text.splitlines():
        if line.startswith('INSTRUMENTATION_STATUS: '):
            key, sep, value = line[24:].partition('=')
            if sep: current[key] = value
        elif line.startswith('INSTRUMENTATION_STATUS_CODE: '):
            code = int(line.split(':', 1)[1].strip())
            if code == 0:
                if current.get('class') != 'io.github.humdrfgry.unlockmusic.OfflineStartupTest':
                    raise ValueError('Unexpected Android test class')
                name = current.get('test')
                if name in passed: raise ValueError('Duplicate Android test result')
                passed.add(name)
            elif code != 1:
                raise ValueError(f'Android test failed/skipped: {current}, status={code}')
            current = {}
    if passed != EXPECTED:
        raise ValueError(f'Android tests missing or unexpected: {passed ^ EXPECTED}')
    if not re.search(r'^INSTRUMENTATION_CODE: -1\s*$', text, re.M) or 'FAILURES!!!' in text or 'INSTRUMENTATION_FAILED' in text:
        raise ValueError('Android instrumentation did not finish successfully')
    return [{'name': name, 'status': 'PASS'} for name in sorted(passed)]

def record(root):
    tests = parse_log((root/'android/tests/instrumentation-ci.log').read_text())
    device = json.loads((root/'android/tests/device-output/device.json').read_text())
    if device.get('api') != 35 or not device.get('webview') or device['webview'] == 'unknown':
        raise ValueError('Android API/WebView evidence missing')
    apk = root/'android/app/build/outputs/apk/debug/app-debug.apk'
    result = {'tests': tests, 'environment': device, 'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
              'method': 'Installed APK + AndroidJUnitRunner on API 35 emulator; Wi-Fi/mobile data disabled. No HTML injection.',
              'limitations': 'Emulator, not physical phone; system picker/provider end-to-end saving is not covered.'}
    path = root/'android/tests/device-results.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(f'{len(tests)} Android WebView instrumentation tests passed')

if __name__ == '__main__': record(ROOT)
