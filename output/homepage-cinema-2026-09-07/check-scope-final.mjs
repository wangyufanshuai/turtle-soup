import { readFileSync,existsSync,writeFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
const root='E:/xuexi/turtle-soup/', baseline=JSON.parse(readFileSync(root+'output/homepage-cinema-2026-09-07/source-before.json','utf8'));
const changed=Object.entries(baseline.hashes).filter(([path,hash])=>existsSync(root+path)&&createHash('sha256').update(readFileSync(root+path)).digest('hex')!==hash).map(([path])=>path);
const protectedPaths=changed.filter(path=>path.startsWith('packages/mystery-core/')||path.startsWith('content/')||path.startsWith('apps/web/workers/'));
const saveUiOnly=changed.filter(path=>path==='apps/web/lib/archive-io.ts'||path==='apps/web/lib/archive-io.test.ts');
const result={checkedAt:new Date().toISOString(),baseline:baseline.capturedAt,filesChecked:Object.keys(baseline.hashes).length,changed,protectedPaths,saveUiOnly,contentCoreUnchanged:protectedPaths.length===0,interpretation:'archive-io changes only defer Blob URL revocation for browser download reliability; save envelope/protocol and case rules remain unchanged'};
writeFileSync(root+'output/homepage-cinema-2026-09-07/source-scope-final.json',JSON.stringify(result,null,2)); console.log(JSON.stringify(result));

