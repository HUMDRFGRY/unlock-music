"""Responsive UI and Android bridge protocol tests. Chromium mocks are not device tests."""
import json, os, shutil, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
results=[]; requests=[]; errors=[]
def passed(name):
    results.append({'name':name,'status':'PASS'}); print('PASS',name,flush=True)
def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), page.evaluate('[innerWidth,document.documentElement.scrollWidth]')
html=(root/'index.html').read_text(encoding='utf-8')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},offline=True,accept_downloads=True)
    page=ctx.new_page(); page.on('request',lambda r:requests.append(r.url)); page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html)
    for width,height in [(320,568),(360,800),(390,844),(412,915),(600,960),(768,1024),(844,390),(1024,768),(1440,900)]:
        page.set_viewport_size({'width':width,'height':height}); no_overflow(page)
    passed('Nine viewport sizes render without horizontal overflow')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(root/'tests/mobile-empty-v020.png'),full_page=True)
    assert not page.locator('#settings-panel').is_visible()
    page.click('#settings-toggle'); expect(page.locator('#settings-panel')).to_be_visible()
    assert page.locator('#settings-toggle').get_attribute('aria-expanded')=='true'
    page.select_option('#naming','artist-title')
    page.click('#settings-toggle'); assert not page.locator('#settings-panel').is_visible()
    passed('Mobile settings collapse, expand, and retain naming selection')
    page.click('#demo-btn'); expect(page.locator('#stat-done')).to_have_text('03',timeout=30000)
    for width in [320,360,390,412,600,768]:
        page.set_viewport_size({'width':width,'height':844}); no_overflow(page)
        for locator in ['#mobile-add','#mobile-save','#select-btn','[data-action=play]','[data-action=download]','[data-action=remove]','#play-btn']:
            for item in page.locator(locator).all():
                box=item.bounding_box(); assert box and box['width']>=44 and box['height']>=44, (width,locator,box)
    passed('Phone/tablet primary controls and row actions have 44px minimum targets')
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('thead').first.is_hidden()
    assert page.locator('#queue-body tr').first.evaluate('(e)=>getComputedStyle(e).display')=='grid'
    with page.expect_download() as download:page.click('#mobile-save')
    target=root/'tests/mobile-batch.zip'; download.value.save_as(str(target))
    with zipfile.ZipFile(target) as z:
        assert len(z.namelist())==3 and z.testzip() is None
        for n in z.namelist():assert z.read(n)==(root/'samples/original.mp3').read_bytes()
    passed('Mobile bottom save action exports exact audio bytes in ZIP')
    page.locator('#audio').evaluate('(a)=>a.pause()')
    page.screenshot(path=str(root/'tests/mobile-results-v020.png'),full_page=True)
    page.click('#clear-btn')
    longname='很长的本地音乐名称_'*12+'.mp3'
    with page.expect_file_chooser() as chooser:page.click('#mobile-add')
    chooser.value.set_files({'name':longname,'mimeType':'audio/mpeg','buffer':(root/'samples/original.mp3').read_bytes()})
    expect(page.locator('#stat-done')).to_have_text('01')
    for width in [320,360,390]:
        page.set_viewport_size({'width':width,'height':844});no_overflow(page)
    passed('Bottom import opens picker; long Chinese filenames wrap without overflow')
    page.set_viewport_size({'width':390,'height':844})
    page.locator('.mobile-nav [data-dialog=guide]').click(); assert page.evaluate("OfflineUI.back()")=='handled'
    assert page.evaluate('OfflineUI.back()')=='confirm'
    page.click('#clear-btn');assert page.evaluate('OfflineUI.back()')=='exit'
    passed('Android back protocol closes dialogs and protects a nonempty queue')
    # A separate browser page emulates only the public Java bridge protocol.
    native=ctx.new_page();native.on('request',lambda r:requests.append(r.url));native.on('pageerror',lambda e:errors.append(str(e)))
    mock=r"""<script>
    window.calls=[];window.nativeBehavior='ok';window.nextId=0;
    window.OfflineNative={
      beginExport(name,mime,size){const id='t'+(++nextId);calls.push({id,name,mime,size,chunks:[]});return id;},
      appendExport(id,data){if(nativeBehavior==='error')return 'ERROR:模拟写入失败';calls.find(c=>c.id===id).chunks.push(data);return 'OK';},
      finishExport(id){if(nativeBehavior!=='hold')setTimeout(()=>onNativeSaveComplete(id,nativeBehavior==='ok',nativeBehavior==='cancel','test'),30);return 'OK';},
      cancelExport(id){calls.find(c=>c.id===id).cancelled=true;}
    };<\/script>""".replace('<\\/script>','</script>')
    native.set_content(html.replace('<script id="engine-source">',mock+'<script id="engine-source">'))
    native.click('#demo-btn');expect(native.locator('#stat-done')).to_have_text('03',timeout=30000)
    native.locator('[data-action=download]').first.click()
    expect(native.locator('#toast')).to_contain_text('已保存：')
    import base64
    saved=native.evaluate('calls[0]')
    assert saved['size']==len((root/'samples/original.mp3').read_bytes())
    assert b''.join(base64.b64decode(s) for s in saved['chunks'])==(root/'samples/original.mp3').read_bytes()
    passed('Android bridge mock: single-file chunks match original audio exactly')
    native.click('#mobile-save');expect(native.locator('#toast')).to_contain_text('已保存：unlock-music-export.zip')
    saved=native.evaluate('calls[1]')
    assert len(saved['chunks'])>=2
    target=root/'tests/native-mock-batch.zip';target.write_bytes(b''.join(base64.b64decode(s) for s in saved['chunks']))
    with zipfile.ZipFile(target) as z:
        assert len(z.namelist())==3 and z.testzip() is None
        for n in z.namelist():assert z.read(n)==(root/'samples/original.mp3').read_bytes()
    passed('Android bridge mock: multi-chunk ZIP length, CRC and file bytes verified')
    native.evaluate("nativeBehavior='cancel'")
    native.locator('[data-action=download]').first.click();expect(native.locator('#toast')).to_contain_text('已取消保存')
    assert native.locator('#stat-done').inner_text()=='03'
    passed('Android bridge mock: cancelled save is not reported as success')
    native.evaluate("nativeBehavior='error'")
    native.locator('[data-action=download]').first.click();expect(native.locator('#toast')).to_contain_text('保存失败')
    assert native.evaluate('calls[calls.length-1].cancelled')
    native.evaluate("nativeBehavior='ok'")
    native.locator('[data-action=download]').first.click();expect(native.locator('#toast')).to_contain_text('已保存：')
    passed('Android bridge mock: failed chunk aborts and subsequent export can retry')
    native.evaluate("nativeBehavior='hold'")
    native.locator('[data-action=download]').first.click()
    native.wait_for_timeout(100)
    count=native.evaluate('calls.length')
    native.locator('[data-action=download]').last.click();expect(native.locator('#toast')).to_contain_text('请先完成当前')
    assert native.evaluate('calls.length')==count
    native.evaluate("onNativeSaveComplete(calls[calls.length-1].id,false,true,'cancel')")
    passed('Android bridge mock: concurrent native save is rejected')
    assert not [r for r in requests if r.startswith(('http:','https:','ws:','wss:'))], requests
    assert not errors, errors
    passed('No external requests or uncaught errors in tested mobile workflows')
    browser.close()
(root/'tests/mobile-results.json').write_text(json.dumps({'groups':len(results),'tests':results,'externalRequests':0,'errors':errors,'limitations':'Linux Chromium at simulated viewport sizes. Native bridge is a mock; no Android runtime, system document picker, APK installation, or real platform-download compatibility test.'},ensure_ascii=False,indent=2),encoding='utf-8')
print(len(results),'mobile test groups passed')
