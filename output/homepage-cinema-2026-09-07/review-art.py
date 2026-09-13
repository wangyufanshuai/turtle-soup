from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,hashlib
root=Path('E:/xuexi/turtle-soup'); out=root/'output/homepage-cinema-2026-09-07'; dest=out/'art-review';dest.mkdir(exist_ok=True)
jobs=json.loads((out/'art-jobs.json').read_text(encoding='utf-8'));font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
cases=[j for j in jobs if j['kind']=='case']; rows=[]
for batch in range(7):
 sheet=Image.new('RGB',(1360,855),'#10161b');draw=ImageDraw.Draw(sheet)
 for i,j in enumerate(cases[batch*12:(batch+1)*12]):
  meta=json.loads((out/'art-metadata'/f"{j['id']}.json").read_text(encoding='utf-8'))
  full=root/'apps/web/public'/meta['results'][0]['path'].lstrip('/'); img=Image.open(full); thumb=img.resize((324,202))
  x=(i%4)*340+8;y=(i//4)*285+8;sheet.paste(thumb,(x,y));draw.text((x,y+211),j['id'].split('-')[0].upper()+' '+j['title'],font=font,fill='#e5dbc7')
  for v in meta['results']:
   f=root/'apps/web/public'/v['path'].lstrip('/'); size=Image.open(f).size
   rows.append({'id':j['id'],'path':v['path'],'bytes':f.stat().st_size,'budget':v['budget'],'dimensions':size,'hashMatches':hashlib.sha256(f.read_bytes()).hexdigest()==v['sha256'],'withinBudget':f.stat().st_size<=v['budget']})
 sheet.save(dest/f'cases-{batch*12+1:02d}-{min((batch+1)*12,84):02d}.jpg',quality=94)
report={'caseCount':len(cases),'variantCount':len(rows),'allValid':all(x['withinBudget'] and x['hashMatches'] for x in rows),'totalBytes':sum(x['bytes'] for x in rows),'uniqueFullHashes':len(set(json.loads((out/'art-metadata'/f"{j['id']}.json").read_text(encoding='utf-8'))['results'][0]['sha256'] for j in cases)),'variants':rows}
(out/'art-review/asset-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8'); print({k:v for k,v in report.items() if k!='variants'})
