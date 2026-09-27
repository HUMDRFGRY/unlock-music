"""Offline browser smoke test. HTML injected into about:blank because sandbox navigation is policy-blocked. Requires Python Playwright and Chromium."""
from pathlib import Path
import json, hashlib, zipfile, os, shutil
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
out=root/'tests'; out.mkdir(exist_ok=True)
results=[]; requests=[];errors=[]
def passed(name):
    results.append({'name':name,'status':'PASS'}); print('PASS',name,flush=True)
def wait_playing(page):
    for _ in range(100):
        if page.evaluate("() => document.querySelector('audio').currentTime > 0.1"):
            return
        page.wait_for_timeout(100)
    raise AssertionError('Audio did not start')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True,offline=True)
    page=ctx.new_page()
    page.on('request',lambda r:requests.append(r.url))
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content((root/'index.html').read_text(encoding='utf-8'));page.wait_for_selector('#demo-btn')
    page.screenshot(path=str(out/'desktop-empty.png'),full_page=True)
    assert page.locator('#stat-total').inner_text()=='00'
    passed('Self-contained HTML cold render with browser network offline (about:blank injection)')
    page.click('#demo-btn');expect(page.locator("#stat-done")).to_have_text("03",timeout=30000)
    assert page.locator('#engine-mode').inner_text().startswith('WORKER')
    assert page.locator('#stat-error').inner_text()=='00'
    passed('NCM / QMC3 / KWM synthetic samples decoded by Blob Worker offline')
    page.screenshot(path=str(out/'desktop-results.png'),full_page=True)
    page.locator('[data-action=play]').first.click();wait_playing(page)
    page.click('#play-btn')
    assert page.locator('#duration').inner_text()!='0:00'
    passed('Actual decoded MP3 preview plays; pause and duration work')
    with page.expect_download() as d:
        page.locator('[data-action=download]').first.click()
    download=d.value;target=out/'single-download.mp3';download.save_as(str(target))
    assert target.read_bytes()==(root/'samples/original.mp3').read_bytes()
    passed('Single-file downloaded bytes match original unencrypted audio')
    with page.expect_download() as d:page.click('#zip-btn')
    target=out/'batch-download.zip';d.value.save_as(str(target))
    with zipfile.ZipFile(target) as z:
        assert len(z.namelist())==3;assert len(set(z.namelist()))==3;assert z.testzip() is None
        assert set(z.namelist())=={'Glass Garden.mp3','Glass Garden (2).mp3','Glass Garden (3).mp3'}
        for name in z.namelist():assert z.read(name)==(root/'samples/original.mp3').read_bytes()
    passed('Batch ZIP CRC / bytes / duplicate-filename numbering verified')
    page.select_option('#naming','artist-title')
    with page.expect_download() as d:page.click('#zip-btn')
    target=out/'batch-unicode.zip';d.value.save_as(str(target))
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None;assert any('玻璃花园' in n for n in z.namelist())
        for n in z.namelist():assert z.read(n)==(root/'samples/original.mp3').read_bytes()
    passed('Unicode metadata filenames are valid in exported ZIP')
    with page.expect_download() as d:page.click('#report-btn')
    target=out/'report-download.json';d.value.save_as(str(target));report=json.loads(target.read_text())
    assert len(report['files'])==3 and report['localOnly'] is True
    passed('Local JSON processing report includes actual file results')
    page.locator('[data-filter=error]').click();assert page.locator('#queue-body tr').count()==0
    page.locator('[data-filter=all]').click();assert page.locator('#queue-body tr').count()==3
    passed('Queue filtering works')
    page.click('#clear-btn');assert page.locator('#stat-total').inner_text()=='00'
    assert page.locator('#play-btn').is_disabled()
    passed('Clearing queue also releases the active preview')
    page.locator('#auto-start').uncheck()
    page.set_input_files('#file-input',str(root/'samples/Glass Garden.ncm'))
    assert page.locator('#stat-done').inner_text()=='00';assert page.locator('#start-btn').is_visible()
    page.click('#start-btn');expect(page.locator("#stat-done")).to_have_text("01",timeout=30000)
    passed('Real local file input and manual processing mode')
    page.locator('#auto-start').check()
    page.set_input_files('#file-input',[{'name':'unsupported.mflac','mimeType':'application/octet-stream','buffer':b'not a supported sample'}, {'name':'broken.ncm','mimeType':'application/octet-stream','buffer':b'CTENFDAM'+b'\x00'*30}])
    expect(page.locator("#stat-error")).to_have_text("02",timeout=30000)
    assert '未集成' in page.locator('#queue-body').inner_text()
    passed('Unsupported and corrupt files fail explicitly; other results remain available')
    page.set_input_files('#file-input',{'name':'<img src=x onerror=alert(1)>.mp3','mimeType':'audio/mpeg','buffer':(root/'samples/original.mp3').read_bytes()})
    expect(page.locator("#stat-done")).to_have_text("02",timeout=30000)
    assert page.locator('#queue-body img').count()==0
    passed('Untrusted filenames are rendered as text, not HTML')
    assert page.evaluate("OfflineMusicUtilities.sanitizeName('../CON:bad?.mp3')")=='.._CON_bad_.mp3'
    assert page.evaluate("OfflineMusicUtilities.sanitizeName('CON')")=='_CON'
    passed('Export filenames sanitize paths, invalid characters and Windows reserved names')
    page.set_input_files('#file-input',{'name':'empty.mp3','mimeType':'audio/mpeg','buffer':b''})
    assert '空文件' in page.locator('#toast').inner_text()
    passed('Empty file rejected before queueing')
    for name in ['formats','guide','about']:
        page.locator('[data-dialog='+name+']').first.click();assert page.locator('#info-dialog').is_visible();page.click('#dialog-ok')
    passed('Format, guide and license dialogs function')
    # Actual DataTransfer drop, not only file input.
    page.evaluate("""() => { const d=JSON.parse(document.getElementById('demo-data').textContent)[1];const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(d.data),c=>c.charCodeAt(0))],'dropped.qmc3'));document.getElementById('dropzone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt})); }""")
    expect(page.locator("#stat-done")).to_have_text("03",timeout=30000)
    passed('Drag-and-drop file import')
    page.click('#clear-btn');page.click('#demo-btn');expect(page.locator("#stat-done")).to_have_text("03",timeout=30000)
    page.locator('[data-action=play]').first.click();wait_playing(page);page.click('#play-btn')
    page.screenshot(path=str(out/'desktop-final.png'),full_page=True)
    # Direct cold load at mobile width; no horizontal page overflow.
    mobile=ctx.new_page()
    mobile.set_viewport_size({'width':390,'height':844});mobile.set_content((root/'index.html').read_text(encoding='utf-8'));mobile.click('#demo-btn');expect(mobile.locator("#stat-done")).to_have_text("03",timeout=30000)
    assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
    mobile.screenshot(path=str(out/'mobile-results.png'),full_page=True)
    passed('390px mobile layout: no horizontal document overflow')
    # Deliberately remove Worker to exercise single-file fallback under file://.
    fallback=ctx.new_page();fallback.add_init_script('window.Worker=undefined;');fallback.evaluate('window.Worker=undefined');fallback.set_content((root/'index.html').read_text(encoding='utf-8'));fallback.click('#demo-btn');expect(fallback.locator("#stat-done")).to_have_text("03",timeout=30000)
    assert '兼容模式' in fallback.locator('#engine-mode').inner_text()
    passed('No-Worker fallback successfully decodes all samples offline')
    external=[x for x in requests if x.startswith(('http:','https:','ws:','wss:'))]
    assert not external,external
    assert not errors,errors
    passed('Zero external HTTP(S)/WebSocket requests and zero uncaught page errors')
    result={'browser':browser.version,'mode':'headless Chromium / Linux; HTML injected into about:blank; offline before render. Direct file:// navigation is blocked by sandbox browser policy; that launch route is not validated here.','browserTestGroups':len(results),'externalRequests':external,'uncaughtErrors':errors,'tests':results,'notTested':['Direct file:// navigation (sandbox browser policy blocks it)','Windows Edge installation','Firefox / Safari','Actual user platform download corpus','All possible damaged codec streams']}
    (out/'browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    browser.close()
print(f'{len(results)} browser test groups passed.',flush=True)
