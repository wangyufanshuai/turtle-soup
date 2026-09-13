import { readFileSync,existsSync,writeFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
const root='E:/xuexi/turtle-soup/',p='output/homepage-cinema-2026-09-07/';
const baseline=JSON.parse(readFileSync(root+p+'source-before.json','utf8'));
const changed=Object.entries(baseline.hashes).filter(([path,hash])=>!existsSync(root+path)||createHash('sha256').update(readFileSync(root+path)).digest('hex')!==hash).map(([path])=>path);
const protectedChanged=changed.filter(path=>path.startsWith('packages/')||path.startsWith('content/')||path.startsWith('apps/web/lib/')||path.startsWith('apps/web/workers/'));
writeFileSync(root+p+'source-scope-r2.json',JSON.stringify({checkedAt:new Date().toISOString(),baseline:baseline.capturedAt,filesChecked:Object.keys(baseline.hashes).length,changed,protectedChanged,coreAndSaveUnchanged:protectedChanged.length===0},null,2));console.log(JSON.stringify({changed,protectedChanged}));
