"""Dependency-free offline builder. Python 3.9+; no package downloads required."""
from pathlib import Path
import json
import re
root=Path(__file__).resolve().parent
version=(root/'VERSION').read_text(encoding='utf-8').strip()
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise ValueError('VERSION must contain numeric x.y.z')
html=(root/'src/template.html').read_text(encoding='utf-8')
html, ui_stamps=re.subn(r'(Offline demo <span>v)\d+\.\d+\.\d+', lambda m:m[1]+version, html)
if ui_stamps != 1:
    raise ValueError('Expected one visible build-version label')
for placeholder,filename in [('/*__CSS__*/','style.css'),('/*__MOBILE_CSS__*/','mobile.css'),('/*__NATIVE__*/','native.js'),('/*__ENGINE__*/','engine.js'),('/*__APP__*/','app.js'),('/*__DEMO__*/','demo-data.json')]:
    content=(root/'src'/filename).read_text(encoding='utf-8')
    if filename == 'app.js':
        content, report_stamps=re.subn(r"version:'\d+\.\d+\.\d+'", 'version:'+json.dumps(version), content)
        if report_stamps != 1:
            raise ValueError('Expected one processing-report version')
    if '</script' in content.lower():
        raise ValueError(f'Unsafe script terminator in {filename}')
    if filename.endswith('.json'):
        content=json.dumps(json.loads(content),ensure_ascii=False).replace('<','\\u003c')
    html=html.replace(placeholder,content)
license_text=(root/'LICENSE').read_text(encoding='utf-8')
html=html.replace('<!-- __LICENSE__ -->','<!-- LICENSE_START\n'+license_text+'\nLICENSE_END -->')
if '/*__' in html:
    raise ValueError('Unresolved template placeholder')
(root/'index.html').write_text(html,encoding='utf-8')
print(f'Built index.html: {len(html.encode("utf-8")):,} bytes')
