import {mkdirSync,readFileSync,copyFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {currentSource,fileTree,hashBytes} from '../../tools/lib/v212-evidence.ts';
const root=process.cwd(),destination=resolve(root,'../turtle-soup-snapshots/content-study-start-2026-09-07');
if(existsSync(resolve(destination,'checkpoint.json')))throw Error('Checkpoint already exists');
const source=currentSource(root),files=[...source.files.filter(f=>f.sha256!=='deleted'),...['apps/web/out','output/m01','output/m2','output/m3','output/ui-polish-2026-09-07','docs'].flatMap(dir=>fileTree(root,dir).map(f=>({path:dir+'/'+f.path,sha256:f.sha256})))];
for(const f of files){const target=resolve(destination,f.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(root,f.path),target);if(hashBytes(readFileSync(target))!==f.sha256)throw Error(f.path);}
const report={at:new Date().toISOString(),destination,sourceDigest:source.digest,files};
writeFileSync(resolve(destination,'checkpoint.json'),JSON.stringify(report,null,2));writeFileSync('output/content-study-2026-09-07/checkpoint.json',JSON.stringify(report,null,2));console.log(JSON.stringify({files:files.length,source:source.digest,destination}));
