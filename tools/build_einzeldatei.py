#!/usr/bin/env python3
"""Baut DienstPlanPro-Einzeldatei.html aus den Quelldateien in DienstPlanPro/.
Aufruf (im Projektordner):  python3 tools/build_einzeldatei.py
Bettet styles.css, i18n.js und app.js direkt in index.html ein.
"""
import os,sys
root=os.path.abspath(sys.argv[1]) if len(sys.argv)>1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=sys.argv[2] if len(sys.argv)>2 else os.path.join(root,'DienstPlanPro-Einzeldatei.html')
d=os.path.join(root,'DienstPlanPro')
rd=lambda n:open(os.path.join(d,n),encoding='utf-8').read()
idx,css,i18n,app=rd('index.html'),rd('styles.css'),rd('i18n.js'),rd('app.js')
for name,code in (('i18n.js',i18n),('app.js',app)):
    if '</script' in code.lower(): sys.exit(f'{name} enthält "</script" – kann nicht eingebettet werden')
def blk(tag,body): return f'  <{tag}>\n{body}\n</{tag}>'
def put(s,a,b):
    assert s.count(a)==1,a; return s.replace(a,b)
idx=put(idx,'  <link rel="stylesheet" href="styles.css">',blk('style',css))
idx=put(idx,'  <script src="i18n.js"></script>',blk('script',i18n))
idx=put(idx,'  <script src="app.js"></script>',blk('script',app))
open(out,'w',encoding='utf-8').write(idx)
print('geschrieben:',out)
