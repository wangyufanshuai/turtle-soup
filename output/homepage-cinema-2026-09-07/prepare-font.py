from pathlib import Path
import sys
import urllib.request
import json
import re
ROOT = Path('E:/xuexi/turtle-soup')
OUT = ROOT / 'output/homepage-cinema-2026-09-07'
sys.path.insert(0, str(OUT / 'python-deps'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

cache = OUT / 'font-source'
cache.mkdir(exist_ok=True)
dest = ROOT / 'apps/web/public/assets/home-cinema/fonts'
dest.mkdir(parents=True, exist_ok=True)
font_path = cache / 'NotoSerifSC.ttf'
base = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/'
if not font_path.exists():
    urllib.request.urlretrieve(base + 'NotoSerifSC%5Bwght%5D.ttf', font_path)
if not (dest / 'OFL.txt').exists():
    urllib.request.urlretrieve(base + 'OFL.txt', dest / 'OFL.txt')
jobs = json.loads((OUT / 'art-jobs.json').read_text(encoding='utf-8'))
text = ''.join(x['title'] for x in jobs)
text += (ROOT / 'apps/web/components/case-select.tsx').read_text(encoding='utf-8-sig')
text += ''.join(path.read_text(encoding='utf-8') for path in (ROOT / 'apps/web/components/home').glob('*.tsx'))
text += '深汤黑汤档案THE BLACK SOUP第一二三四五季观测的边界系统留下错觉测量之外被误读现实冷藏室的敲门声五季悬案等你入局继续调查回看结案件另一份值得打开的档案全部案件没有匹配的谜案本地存档最近调查今夜的谜案选择一份档案开始调查所有案件均可直接进入0123456789 /·，。！？：—ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
font = instantiateVariableFont(TTFont(font_path), {'wght':400}, inplace=True)
options = subset.Options()
options.flavor = 'woff2'
options.desubroutinize = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
font.flavor = 'woff2'
font.save(dest / 'cinema-serif.woff2')
(OUT / 'font-source.json').write_text(json.dumps({'family':'Noto Serif SC','source':'https://github.com/google/fonts/tree/main/ofl/notoserifsc','license':'SIL Open Font License 1.1','weight':400,'subsetCharacters':len(set(text)),'output':'/assets/home-cinema/fonts/cinema-serif.woff2','bytes':(dest/'cinema-serif.woff2').stat().st_size},ensure_ascii=False,indent=2),encoding='utf-8')
print((dest/'cinema-serif.woff2').stat().st_size)
