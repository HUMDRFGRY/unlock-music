#!/usr/bin/env python3
"""Local packaging and mocked-gh tests; these do not build Android or access GitHub."""
from __future__ import annotations
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('packager', HERE/'package-offline.py')
PKG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PKG)
SHA = 'a' * 40
VERSION = '0.2.0'
# Fake GitHub CLI for isolated state-machine tests. Never communicates with GitHub.
FAKE_GH = r'''#!/usr/bin/env python3
import json, os, shutil, sys
from pathlib import Path
p=Path(os.environ['FAKE_GH_STATE']); a=sys.argv[1:]
with (p/'calls').open('a') as f: f.write(json.dumps(a)+'\n')
def get(key): return a[a.index(key)+1]
r=p/'release.json'
if a[0]=='api':
 print((p/'refs.json').read_text() if (p/'refs.json').exists() else '[]'); sys.exit(0)
if a[:2]==['release','view']:
 if not r.exists(): sys.exit(1)
 data=json.loads(r.read_text())
 if '--jq' in a: print(data['url'])
 else: print(json.dumps(data))
elif a[:2]==['release','create']:
 if r.exists(): sys.exit(1)
 data={'isDraft': True, 'targetCommitish': get('--target'),
       'body': Path(get('--notes-file')).read_text(), 'url': 'https://example.invalid/offline-test'}
 r.write_text(json.dumps(data))
elif a[:2]==['release','upload']:
 if os.environ.get('FAKE_FAIL_UPLOAD')=='1': sys.exit(1)
 d=p/'assets'; d.mkdir(exist_ok=True)
 for filename in a[3:a.index('--repo')]: shutil.copy2(filename,d/Path(filename).name)
elif a[:2]==['release','download']:
 d=Path(get('--dir'))
 for f in (p/'assets').iterdir(): shutil.copy2(f,d/f.name)
 if os.environ.get('FAKE_CORRUPT_DOWNLOAD')=='1':
  (d/'BUILD-INFO.json').write_text('corrupt download')
elif a[:2]==['release','edit']:
 data=json.loads(r.read_text()); data['isDraft']=False; r.write_text(json.dumps(data))
else: raise SystemExit('Unsupported fake gh invocation: '+repr(a))
'''

class ReleaseTools(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)/'repo'
        self.root.mkdir()
        for d in ['offline/tests','android/app/build/outputs/apk/debug',
                  'android/app/build/reports','android/tests']:
            (self.root/d).mkdir(parents=True, exist_ok=True)
        (self.root/'offline/VERSION').write_text(VERSION)
        (self.root/'android/app/build.gradle').write_text("versionName '0.2.0'")
        self.page=b'<!doctype html><title>Test fixture only, not a compiled application</title>'
        for name in ['index.html','README.md','LICENSE','UPSTREAM.md']:
            (self.root/'offline'/name).write_bytes(self.page)
        self.apk=self.root/'android/app/build/outputs/apk/debug/app-debug.apk'
        self.write_fixture_apk(self.page)
        for name in ['engine-results.json','browser-results.json','mobile-results.json']:
            (self.root/'offline/tests'/name).write_text(json.dumps({'tests':[{'status':'PASS'}]}))
        for name in ['android/app/build/reports/lint-results-debug.html',
                     'android/tests/native-ci.log','android/tests/apk-signature-ci.log']:
            (self.root/name).write_text('simulated CI fixture only')
        self.out=self.root/'artifacts'
        self.state=Path(self.tmp.name)/'mock'; self.state.mkdir()
        self.bin=Path(self.tmp.name)/'bin'; self.bin.mkdir()
        (self.bin/'gh').write_text(FAKE_GH); (self.bin/'gh').chmod(0o755)
    def tearDown(self): self.tmp.cleanup()
    def write_fixture_apk(self, page):
        with zipfile.ZipFile(self.apk,'w') as z:
            z.writestr('AndroidManifest.xml',b'mock manifest')
            z.writestr('classes.dex',b'mock dex')
            z.writestr('assets/index.html',page)
    def build_assets(self): return PKG.package(self.root,self.out,SHA)
    def publish(self, **changes):
        env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
             'GH_TOKEN':'non-secret-mock-value','GITHUB_REPOSITORY':'HUMDRFGRY/unlock-music',
             'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'push','GITHUB_SHA':SHA,
             'GITHUB_RUN_ID':'123','VERSION':VERSION,'FAKE_GH_STATE':str(self.state),
             'GITHUB_STEP_SUMMARY':str(self.state/'summary'),**changes}
        return subprocess.run(['bash',str(HERE/'publish-offline.sh'),str(self.out)],
                              env=env,text=True,capture_output=True)
    def test_package_identity_and_checksums(self):
        names=self.build_assets(); self.assertEqual(len(names),6)
        info=json.loads((self.out/'BUILD-INFO.json').read_text())
        self.assertEqual(info['source_commit'],SHA)
        self.assertFalse(info['android_device_tested'])
        result=subprocess.run(['sha256sum','-c','SHA256SUMS.txt'],cwd=self.out,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        with zipfile.ZipFile(self.out/f'unlock-music-offline-{VERSION}-web.zip') as z:
            self.assertEqual(len(z.namelist()),4)
            self.assertEqual(z.read(f'unlock-music-offline-{VERSION}/index.html'),self.page)
    def test_missing_apk_is_never_fabricated(self):
        self.apk.unlink()
        with self.assertRaises(FileNotFoundError): self.build_assets()
    def test_different_bundled_web_fails(self):
        self.write_fixture_apk(b'different page')
        with self.assertRaises(ValueError): self.build_assets()
    def test_version_mismatch_fails(self):
        (self.root/'offline/VERSION').write_text('0.3.0')
        with self.assertRaises(ValueError): self.build_assets()
    def test_untrusted_version_fails(self):
        (self.root/'offline/VERSION').write_text('../../other')
        with self.assertRaises(ValueError): self.build_assets()
    def test_failed_evidence_blocks_packaging(self):
        (self.root/'offline/tests/engine-results.json').write_text('{"tests":[{"status":"FAIL"}]}')
        with self.assertRaises(ValueError): self.build_assets()
    def test_mixed_output_directory_fails(self):
        self.build_assets()
        with self.assertRaises(ValueError): self.build_assets()
    def test_release_round_trip_and_idempotence(self):
        self.build_assets(); result=self.publish()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(json.loads((self.state/'release.json').read_text())['isDraft'])
        count=(self.state/'calls').read_text().count('"upload"')
        result=self.publish(); self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.state/'calls').read_text().count('"upload"'),count)
    def test_upload_failure_keeps_draft_and_can_retry(self):
        self.build_assets(); result=self.publish(FAKE_FAIL_UPLOAD='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(json.loads((self.state/'release.json').read_text())['isDraft'])
        result=self.publish(); self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(json.loads((self.state/'release.json').read_text())['isDraft'])
    def test_corrupt_download_never_publishes(self):
        self.build_assets(); result=self.publish(FAKE_CORRUPT_DOWNLOAD='1')
        self.assertNotEqual(result.returncode,0)
        self.assertTrue(json.loads((self.state/'release.json').read_text())['isDraft'])
    def test_existing_tag_never_moved(self):
        self.build_assets()
        (self.state/'refs.json').write_text(json.dumps([{
            'ref':'refs/tags/offline-v0.2.0','object':{'type':'commit','sha':'b'*40}}]))
        self.assertNotEqual(self.publish().returncode,0)
        self.assertFalse((self.state/'release.json').exists())
    def test_other_release_never_overwritten(self):
        self.build_assets()
        other={'isDraft':False,'targetCommitish':'b'*40,'body':'Another release','url':'test'}
        (self.state/'release.json').write_text(json.dumps(other))
        self.assertNotEqual(self.publish().returncode,0)
        self.assertEqual(json.loads((self.state/'release.json').read_text()),other)
    def test_fork_blocked(self):
        self.assertNotEqual(self.publish(GITHUB_REPOSITORY='other/fork').returncode,0)
        self.assertFalse((self.state/'calls').exists())
    def test_feature_branch_blocked(self):
        self.assertNotEqual(self.publish(GITHUB_REF='refs/heads/feature').returncode,0)
        self.assertFalse((self.state/'calls').exists())
    def test_pull_request_blocked(self):
        self.assertNotEqual(self.publish(GITHUB_EVENT_NAME='pull_request').returncode,0)
        self.assertFalse((self.state/'calls').exists())
    def test_workflow_uses_separate_write_job(self):
        text=(HERE.parent/'workflows/offline-android.yml').read_text()
        self.assertIn('needs: test-and-build',text)
        build=text.split('  publish-release:')[0]
        self.assertNotIn('contents: write',build)
        self.assertNotIn('pull_request_target:',text)
        self.assertIn("github.ref == 'refs/heads/main'",text)
        self.assertIn('contents: write',text.split('  publish-release:')[1])
    def test_shell_syntax(self):
        result=subprocess.run(['bash','-n',str(HERE/'publish-offline.sh')],capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__': unittest.main(verbosity=2)
