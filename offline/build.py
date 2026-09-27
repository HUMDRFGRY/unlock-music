"""Dependency-free offline builder. Python 3.9+; no package downloads required."""
from pathlib import Path
import json
root=Path(__file__).resolve().parent
html=(root/'src/template.html').read_text(encoding='utf-8')
for placeholder,filename in [('/*__CSS__*/','style.css'),('/*__MOBILE_CSS__*/','mobile.css'),('/*__NATIVE__*/','native.js'),('/*__ENGINE__*/','engine.js'),('/*__APP__*/','app.js'),('/*__DEMO__*/','demo-data.json')]:
    content=(root/'src'/filename).read_text(encoding='utf-8')
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
