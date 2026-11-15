#!/usr/bin/env python3
"""Turn the research file (model-params.json) into the compact RESEARCH block inside app-source.html.
Usage: python3 tools/make-params.py /path/to/model-params.json   then   python3 build.py app-source.html"""
import json,re,sys
d=json.load(open(sys.argv[1]));src='app-source.html';s=open(src).read()
val=lambda x:x['value'] if isinstance(x,dict) and 'value' in x else x
NUM=['sellPct','sellLo','sellHi','sellThru','reconPt','lemonPct','lemonCost','driftMult']
def block(b):
    o={k:val(b[k]) for k in NUM if k in b}
    if b.get('years'):o['y']=b['years']
    if b.get('avoid'):o['avoid']=1
    if b.get('rating'):o['rating']=val(b['rating'])
    if b.get('flag'):o['flag']=val(b['flag'])
    return o
D=d['default']
out={'v':d['_meta']['version'],'date':d['_meta']['date'],
 'def':{k:val(D[k]) for k in ['sellPct','sellLo','sellHi','sellThru','reconPt','driftWk','lemonPct','lemonCost']},
 'months':{m:[x['sellAdj'],x['sellThru'],x['driftWk']] for m,x in d['seasonal']['months'].items()},
 'seg':{k:block(v) for k,v in d['segments'].items()},
 'models':{k:[block(y) for y in v['byYear']] if 'byYear' in v else [block(v)] for k,v in d['models'].items()}}
js='/*RESEARCH:BEGIN*/const RESEARCH='+json.dumps(out,separators=(',',':'),ensure_ascii=False)+';/*RESEARCH:END*/'
assert s.count('/*RESEARCH:BEGIN*/')==1
s=re.sub(r'/\*RESEARCH:BEGIN\*/.*?/\*RESEARCH:END\*/',lambda m:js,s,flags=re.S)
open(src,'w').write(s);print('research v'+out['v'],len(js),'bytes,',len(out['models']),'models')
