import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve('E:/xuexi/turtle-soup');
const output = join(root, 'output/homepage-cinema-2026-09-07');
const [id, source] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(join(output, 'art-jobs.json'), 'utf8'));
const job = jobs.find(item => item.id === id);
if (!job || !source || !source.toLowerCase().endsWith('.png')) throw new Error('Unknown art job or missing generated PNG');
const publicRoot = join(root, 'apps/web/public/assets/home-cinema');
mkdirSync(publicRoot, { recursive: true });
mkdirSync(join(output, 'art-metadata'), { recursive: true });
const variants = job.kind === 'hero' ? [{name:id, width:2304, height:1152, budget:500000}]
  : job.kind === 'mobile' ? [{name:id, width:960, height:1280, budget:250000}]
  : job.kind === 'season' ? [{name:id, width:640, height:800, budget:100000}]
  : [{name:id, width:1280, height:800, budget:180000}, {name:id+'-thumb', width:640, height:400, budget:75000}];
const results = [];
for (const variant of variants) {
  let quality = 84;
  let bytes;
  do {
    bytes = await sharp(source).resize(variant.width, variant.height, {fit:'cover', position:'centre'}).webp({quality, effort:5}).toBuffer();
    if (bytes.length <= variant.budget) break;
    quality -= 5;
  } while (quality >= 49);
  const file = join(publicRoot, variant.name+'.webp');
  writeFileSync(file, bytes);
  results.push({ path:'/assets/home-cinema/'+variant.name+'.webp', width:variant.width, height:variant.height, bytes:bytes.length, quality, budget:variant.budget, sha256:createHash('sha256').update(bytes).digest('hex') });
}
const metadata = {id, title:job.title, kind:job.kind, source, sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'), generatedWith:'built-in ImageGen', prompt:job.prompt, reviewed:false, results};
writeFileSync(join(output, 'art-metadata', id+'.json'), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify({id, results}));
